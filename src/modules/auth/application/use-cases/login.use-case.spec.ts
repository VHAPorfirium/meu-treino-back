import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { LoginThrottleService } from '../../../../shared/security/login-throttle.service';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { CryptoService } from '../../../../shared/security/crypto.service';
import { UserStatusCacheService } from '../../../../shared/auth/user-status-cache.service';
import { UserRepository } from '../../../users/domain/user.repository';
import { LoginUseCase } from './login.use-case';

jest.mock('argon2', () => {
  const actual = jest.requireActual<typeof import('argon2')>('argon2');
  return {
    ...actual,
    verify: jest.fn((...args: Parameters<typeof actual.verify>) =>
      actual.verify(...args),
    ),
  };
});

const VALID_CPF_1 = '52998224725';
const VALID_CPF_2 = '11144477735';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    name: 'Gabriel Silva',
    username: 'gabriel.silva',
    cpfHash: null,
    cpfEncrypted: null,
    role: Role.TRAINEE,
    pinHash: '',
    active: true,
    mustChangePassword: false,
    tokenVersion: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('LoginUseCase — CPF O(1), perfil duplo (PERSONAL+TRAINEE), fallback legado, anti-timing e lockout', () => {
  const crypto = new CryptoService();

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createDeps(repoOverrides: Partial<UserRepository> = {}) {
    const users = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByCpfHash: jest.fn().mockResolvedValue(null),
      findManyByCpfHash: jest.fn().mockResolvedValue([]),
      findByUsername: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(makeUser()),
      ...repoOverrides,
    } as unknown as jest.Mocked<UserRepository>;
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('tok-jwt'),
    } as unknown as jest.Mocked<JwtService>;
    const security = { event: jest.fn() } as unknown as jest.Mocked<SecurityLogger>;
    const throttle = new LoginThrottleService();
    const userStatusCache = {
      invalidate: jest.fn(),
    } as unknown as jest.Mocked<UserStatusCacheService>;
    const useCase = new LoginUseCase(
      users,
      jwt,
      security,
      throttle,
      crypto,
      userStatusCache,
    );
    return { useCase, users, jwt, security, throttle, userStatusCache };
  }

  it('autentica em O(1) via cpfHash (com CPF formatado) sem varrer findAll', async () => {
    const pinHash = await argon2.hash('SenhaForte@1', { type: argon2.argon2id });
    const cpfHash = crypto.hashCpf(VALID_CPF_1);
    const user = makeUser({ pinHash, cpfHash });

    const { useCase, users, security } = createDeps({
      findManyByCpfHash: jest.fn().mockResolvedValue([user]),
    });

    const result = await useCase.execute(
      { identifier: '529.982.247-25', password: 'SenhaForte@1' },
      { ip: '203.0.113.1', userAgent: 'Chrome', requestId: 'req-1' },
    );

    expect(users.findAll).not.toHaveBeenCalled();
    expect(users.findManyByCpfHash).toHaveBeenCalledWith(cpfHash);
    expect(result).toEqual({
      token: 'tok-jwt',
      user: {
        id: 'u1',
        name: 'Gabriel Silva',
        username: 'gabriel.silva',
        role: Role.TRAINEE,
        mustChangePassword: false,
      },
    });
    expect(security.event).toHaveBeenCalledWith(
      'auth.login.success',
      expect.objectContaining({
        userId: 'u1',
        identifierMasked: '***.982.247-**',
        statusCode: 200,
      }),
    );
  });

  it('retorna requiresProfileSelection quando mesmo CPF tem PERSONAL e TRAINEE ativos com a mesma senha, e conclui ao informar role', async () => {
    const sharedHash = await argon2.hash('MesmaSenha@1', { type: argon2.argon2id });
    const cpfHash = crypto.hashCpf(VALID_CPF_1);
    const personal = makeUser({
      id: 'u-pers',
      name: 'Victor Personal',
      username: 'victor.personal',
      role: Role.PERSONAL,
      cpfHash,
      pinHash: sharedHash,
    });
    const trainee = makeUser({
      id: 'u-trainee',
      name: 'Victor Hugo',
      username: 'victor.hugo',
      role: Role.TRAINEE,
      cpfHash,
      pinHash: sharedHash,
    });

    const { useCase } = createDeps({
      findManyByCpfHash: jest.fn().mockResolvedValue([personal, trainee]),
    });

    // Senha errada continua 401 sem vazar perfis
    await expect(
      useCase.execute(
        { identifier: VALID_CPF_1, password: 'Errada@1' },
        { ip: '203.0.113.15' },
      ),
    ).rejects.toThrow(UnauthorizedException);

    // Senha correta sem role -> pede seleção de perfil
    const choice = await useCase.execute(
      { identifier: VALID_CPF_1, password: 'MesmaSenha@1' },
      { ip: '203.0.113.15' },
    );
    expect(choice).toEqual({
      requiresProfileSelection: true,
      profiles: [
        { role: Role.PERSONAL, name: 'Victor Personal', username: 'victor.personal' },
        { role: Role.TRAINEE, name: 'Victor Hugo', username: 'victor.hugo' },
      ],
    });

    // Com role escolhido -> autentica diretamente no perfil selecionado
    const logged = await useCase.execute(
      { identifier: VALID_CPF_1, password: 'MesmaSenha@1', role: Role.PERSONAL },
      { ip: '203.0.113.15' },
    );
    expect(logged.requiresProfileSelection).toBeFalsy();
    if (!logged.requiresProfileSelection) {
      expect(logged.user).toMatchObject({
        id: 'u-pers',
        role: Role.PERSONAL,
        username: 'victor.personal',
      });
    }
  });

  it('entra direto no único perfil cuja senha confere quando mesmo CPF tem senhas diferentes', async () => {
    const hashPersonal = await argon2.hash('SenhaPersonal@1', { type: argon2.argon2id });
    const hashTrainee = await argon2.hash('SenhaAluno@1', { type: argon2.argon2id });
    const cpfHash = crypto.hashCpf(VALID_CPF_1);
    const personal = makeUser({
      id: 'u-pers',
      username: 'victor.personal',
      role: Role.PERSONAL,
      cpfHash,
      pinHash: hashPersonal,
    });
    const trainee = makeUser({
      id: 'u-trainee',
      username: 'victor.hugo',
      role: Role.TRAINEE,
      cpfHash,
      pinHash: hashTrainee,
    });

    const { useCase } = createDeps({
      findManyByCpfHash: jest.fn().mockResolvedValue([personal, trainee]),
    });

    const res = await useCase.execute(
      { identifier: VALID_CPF_1, password: 'SenhaAluno@1' },
      { ip: '203.0.113.16' },
    );
    expect(res.requiresProfileSelection).toBeFalsy();
    if (!res.requiresProfileSelection) {
      expect(res.user.id).toBe('u-trainee');
    }
  });

  it('permite fallback por username legado apenas quando cpfHash é null e força troca de PIN fraco', async () => {
    const pinHash = await argon2.hash('1234', { type: argon2.argon2id });
    const legacyUser = makeUser({
      id: 'u-legacy',
      username: 'ninfa',
      cpfHash: null,
      pinHash,
      mustChangePassword: false,
    });

    const { useCase, users, userStatusCache } = createDeps({
      findByUsername: jest.fn().mockResolvedValue(legacyUser),
    });

    const result = await useCase.execute(
      { identifier: 'ninfa', password: '1234' },
      { ip: '203.0.113.2' },
    );

    expect(users.findByUsername).toHaveBeenCalledWith('ninfa');
    expect(users.update).toHaveBeenCalledWith('u-legacy', {
      mustChangePassword: true,
    });
    expect(userStatusCache.invalidate).toHaveBeenCalledWith('u-legacy');
    if (!result.requiresProfileSelection) {
      expect(result.user.mustChangePassword).toBe(true);
    }
  });

  it('bloqueia login por username para contas que já possuem CPF cadastrado', async () => {
    const pinHash = await argon2.hash('SenhaForte@1', { type: argon2.argon2id });
    const migratedUser = makeUser({
      username: 'gabriel.silva',
      cpfHash: crypto.hashCpf(VALID_CPF_1),
      pinHash,
    });

    const { useCase } = createDeps({
      findByUsername: jest.fn().mockResolvedValue(migratedUser),
    });

    await expect(
      useCase.execute(
        { identifier: 'gabriel.silva', password: 'SenhaForte@1' },
        { ip: '203.0.113.3' },
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('executa argon2.verify dummy contra timing attack quando o usuário não existe', async () => {
    const { useCase } = createDeps();

    await expect(
      useCase.execute(
        { identifier: VALID_CPF_1, password: 'QualquerSenha@1' },
        { ip: '203.0.113.4' },
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(argon2.verify).toHaveBeenCalledTimes(1);
  });

  it('rejeita conta desativada com mensagem específica apenas quando a senha confere', async () => {
    const pinHash = await argon2.hash('SenhaForte@1', { type: argon2.argon2id });
    const inactiveUser = makeUser({
      cpfHash: crypto.hashCpf(VALID_CPF_1),
      pinHash,
      active: false,
    });
    const { useCase, security } = createDeps({
      findManyByCpfHash: jest.fn().mockResolvedValue([inactiveUser]),
    });

    await expect(
      useCase.execute(
        { identifier: VALID_CPF_1, password: 'Errada@1' },
        { ip: '203.0.113.5' },
      ),
    ).rejects.toThrow('Credenciais inválidas');

    await expect(
      useCase.execute(
        { identifier: VALID_CPF_1, password: 'SenhaForte@1' },
        { ip: '203.0.113.5' },
      ),
    ).rejects.toThrow('Conta desativada. Procure a recepção.');

    expect(security.event).toHaveBeenCalledWith(
      'auth.login.failure',
      expect.objectContaining({ reason: 'account_inactive', userId: 'u1' }),
    );
  });

  it('isola lockout por (IP + identificador): erro de um aluno no Wi-Fi não trava outro CPF', async () => {
    const pinHash2 = await argon2.hash('SenhaForte@2', { type: argon2.argon2id });
    const hash2 = crypto.hashCpf(VALID_CPF_2);
    const user2 = makeUser({ id: 'u2', username: 'outro', cpfHash: hash2, pinHash: pinHash2 });

    const { useCase } = createDeps({
      findManyByCpfHash: jest.fn().mockImplementation(async (h) => (h === hash2 ? [user2] : [])),
    });

    for (let i = 0; i < 5; i++) {
      await expect(
        useCase.execute({ identifier: VALID_CPF_1, password: 'Errada@1' }, { ip: '198.51.100.1' }),
      ).rejects.toThrow(UnauthorizedException);
    }

    await expect(
      useCase.execute({ identifier: VALID_CPF_1, password: 'Errada@1' }, { ip: '198.51.100.1' }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    const ok = await useCase.execute(
      { identifier: VALID_CPF_2, password: 'SenhaForte@2' },
      { ip: '198.51.100.1' },
    );
    expect(ok.requiresProfileSelection).toBeFalsy();
    if (!ok.requiresProfileSelection) {
      expect(ok.user.id).toBe('u2');
    }
  });

  it('limita rajada paralela de 10 requisições no mesmo (IP + CPF) a 5 verificações (TOCTOU)', async () => {
    const pinHash = await argon2.hash('SenhaForte@1', { type: argon2.argon2id });
    const cpfHash = crypto.hashCpf(VALID_CPF_1);
    const findManyByCpfHash = jest.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return [makeUser({ cpfHash, pinHash })];
    });

    const { useCase } = createDeps({ findManyByCpfHash });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        useCase.execute(
          { identifier: VALID_CPF_1, password: 'Errada@1' },
          { ip: '203.0.113.10', requestId: 'req-1' },
        ),
      ),
    );

    const unauthorized = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof UnauthorizedException,
    );
    const tooMany = results.filter(
      (r) =>
        r.status === 'rejected' &&
        r.reason instanceof HttpException &&
        r.reason.getStatus() === HttpStatus.TOO_MANY_REQUESTS,
    );

    expect(findManyByCpfHash).toHaveBeenCalledTimes(5);
    expect(unauthorized).toHaveLength(5);
    expect(tooMany).toHaveLength(5);
  });

  it('libera a vaga reservada se o repositório falhar com erro inesperado', async () => {
    const { useCase, throttle } = createDeps({
      findManyByCpfHash: jest.fn().mockRejectedValue(new Error('db offline')),
    });

    await expect(
      useCase.execute({ identifier: VALID_CPF_1, password: 'SenhaForte@1' }, { ip: '203.0.113.99' }),
    ).rejects.toThrow('db offline');

    const throttleKey = throttle.key('203.0.113.99', crypto.hashCpf(VALID_CPF_1).slice(0, 16));
    expect(throttle.status(throttleKey)).toMatchObject({ locked: false, attempts: 0 });
    expect(throttle.acquireAttempt(throttleKey).locked).toBe(false);
  });
});
