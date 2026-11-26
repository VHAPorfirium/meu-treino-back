import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { UserStatusCacheService } from '../../../../shared/auth/user-status-cache.service';
import { CryptoService } from '../../../../shared/security/crypto.service';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { UserRepository } from '../../domain/user.repository';
import { CreateTraineeUseCase } from './create-trainee.use-case';
import { ListUsersUseCase } from './list-users.use-case';
import { SuggestUsernameUseCase } from './suggest-username.use-case';
import { UpdateUserUseCase } from './update-user.use-case';
import { SetUserActiveUseCase } from './set-user-active.use-case';
import { ResetUserPasswordUseCase } from './reset-user-password.use-case';

const CPF_1 = '52998224725';
const CPF_2 = '11144477735';

const ACTOR_CTX = {
  actorUserId: 'admin-1',
  ip: '127.0.0.1',
  userAgent: 'Jest/1.0',
  requestId: 'req-1',
};

function makeInMemoryRepo(initial: User[] = []): UserRepository {
  const store = new Map<string, User>(initial.map((u) => [u.id, { ...u }]));
  return {
    async findAll() {
      return Array.from(store.values());
    },
    async findById(id) {
      return store.get(id) ?? null;
    },
    async findByCpfHash(cpfHash) {
      for (const u of store.values()) {
        if (u.cpfHash === cpfHash) return u;
      }
      return null;
    },
    async findManyByCpfHash(cpfHash) {
      return Array.from(store.values()).filter((u) => u.cpfHash === cpfHash);
    },
    async findByUsername(username) {
      for (const u of store.values()) {
        if (u.username === username) return u;
      }
      return null;
    },
    async create(data) {
      const user: User = {
        id: data.id ?? `u_${store.size + 1}`,
        name: data.name,
        username: data.username ?? 'user',
        cpfHash: data.cpfHash ?? null,
        cpfEncrypted: data.cpfEncrypted ?? null,
        role: data.role,
        pinHash: data.pinHash,
        active: data.active ?? true,
        mustChangePassword: data.mustChangePassword ?? false,
        createdAt: new Date(),
      };
      store.set(user.id, user);
      return user;
    },
    async update(id, data) {
      const existing = store.get(id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data };
      store.set(id, updated);
      return updated;
    },
  };
}

describe('Users lifecycle use-cases (Fase 1)', () => {
  const crypto = new CryptoService();

  it('cria aluno com CPF cifrado, username único automático e mustChangePassword=true', async () => {
    const existingGabriel: User = {
      id: 'u-old',
      name: 'Gabriel Silva',
      username: 'gabriel.silva',
      cpfHash: null,
      cpfEncrypted: null,
      role: Role.TRAINEE,
      pinHash: 'hash',
      active: true,
      mustChangePassword: false,
      createdAt: new Date(),
    };
    const repo = makeInMemoryRepo([existingGabriel]);
    const security = { event: jest.fn() } as unknown as SecurityLogger;
    const createTrainee = new CreateTraineeUseCase(repo, crypto, security);

    const created = await createTrainee.execute(
      {
        name: 'Gabriel da Silva',
        cpf: '529.982.247-25',
        password: 'Treino@2026',
      },
      ACTOR_CTX,
    );

    expect(created).toEqual({
      id: expect.any(String),
      name: 'Gabriel da Silva',
      username: 'gabriel.silva2',
      role: Role.TRAINEE,
      active: true,
      mustChangePassword: true,
      cpfMasked: '***.982.247-**',
    });

    const stored = await repo.findById(created.id);
    expect(stored?.cpfHash).toBe(crypto.hashCpf(CPF_1));
    expect(crypto.decrypt(stored!.cpfEncrypted!, `user:cpf:${created.id}`)).toBe(
      CPF_1,
    );
    expect(await argon2.verify(stored!.pinHash, 'Treino@2026')).toBe(true);
    expect(security.event).toHaveBeenCalledWith(
      'auth.account.created',
      expect.objectContaining({
        userId: created.id,
        actorUserId: 'admin-1',
        identifierMasked: '***.982.247-**',
      }),
    );

    // CPF duplicado deve retornar 409
    await expect(
      createTrainee.execute(
        { name: 'Outro Aluno', cpf: CPF_1, password: 'Treino@2026' },
        ACTOR_CTX,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejeita CPF inválido e senha fraca ao criar aluno', async () => {
    const repo = makeInMemoryRepo();
    const security = { event: jest.fn() } as unknown as SecurityLogger;
    const createTrainee = new CreateTraineeUseCase(repo, crypto, security);

    await expect(
      createTrainee.execute(
        { name: 'Ana Paula', cpf: '111.111.111-11', password: 'Treino@2026' },
        ACTOR_CTX,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      createTrainee.execute(
        { name: 'Ana Paula', cpf: CPF_1, password: '123456' },
        ACTOR_CTX,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('sugere username único evitando colisões existentes', async () => {
    const repo = makeInMemoryRepo([
      {
        id: 'u1',
        name: 'Maria Souza',
        username: 'maria.souza',
        cpfHash: null,
        cpfEncrypted: null,
        role: Role.TRAINEE,
        pinHash: 'h',
        active: true,
        mustChangePassword: false,
        createdAt: new Date(),
      },
    ]);
    const suggest = new SuggestUsernameUseCase(repo);

    expect(await suggest.execute('Maria de Souza')).toEqual({
      username: 'maria.souza2',
    });
  });

  it('atualiza dados cadastrais (incluindo CPF de conta legada) e invalida cache', async () => {
    const repo = makeInMemoryRepo([
      {
        id: 'u-legacy',
        name: 'Ninfa',
        username: 'ninfa',
        cpfHash: null,
        cpfEncrypted: null,
        role: Role.TRAINEE,
        pinHash: 'h',
        active: true,
        mustChangePassword: false,
        createdAt: new Date(),
      },
    ]);
    const cache = { invalidate: jest.fn() } as unknown as UserStatusCacheService;
    const security = { event: jest.fn() } as unknown as SecurityLogger;
    const updateUser = new UpdateUserUseCase(repo, crypto, cache, security);

    const updated = await updateUser.execute(
      'u-legacy',
      { name: 'Ninfa Porfirio', username: 'ninfa.porfirio', cpf: CPF_2 },
      ACTOR_CTX,
    );

    expect(updated).toMatchObject({
      id: 'u-legacy',
      name: 'Ninfa Porfirio',
      username: 'ninfa.porfirio',
      cpfMasked: '***.444.777-**',
    });
    expect(cache.invalidate).toHaveBeenCalledWith('u-legacy');
    expect(security.event).toHaveBeenCalledWith(
      'auth.account.updated',
      expect.objectContaining({ userId: 'u-legacy', actorUserId: 'admin-1' }),
    );

    await expect(
      updateUser.execute('nao-existe', { name: 'X' }, ACTOR_CTX),
    ).rejects.toThrow(NotFoundException);
  });

  it('desativa e reativa aluno invalidando cache e impede auto-desativação do admin', async () => {
    const repo = makeInMemoryRepo([
      {
        id: 'admin-1',
        name: 'Admin',
        username: 'admin',
        cpfHash: null,
        cpfEncrypted: null,
        role: Role.ADMIN,
        pinHash: 'h',
        active: true,
        mustChangePassword: false,
        createdAt: new Date(),
      },
      {
        id: 'u-aluno',
        name: 'Aluno',
        username: 'aluno',
        cpfHash: null,
        cpfEncrypted: null,
        role: Role.TRAINEE,
        pinHash: 'h',
        active: true,
        mustChangePassword: false,
        createdAt: new Date(),
      },
    ]);
    const cache = { invalidate: jest.fn() } as unknown as UserStatusCacheService;
    const security = { event: jest.fn() } as unknown as SecurityLogger;
    const setActive = new SetUserActiveUseCase(repo, crypto, cache, security);

    // Impede auto-desativação
    await expect(
      setActive.execute('admin-1', { active: false }, ACTOR_CTX),
    ).rejects.toThrow(BadRequestException);

    // Desativa aluno
    const deactivated = await setActive.execute(
      'u-aluno',
      { active: false },
      ACTOR_CTX,
    );
    expect(deactivated.active).toBe(false);
    expect(cache.invalidate).toHaveBeenCalledWith('u-aluno');
    expect(security.event).toHaveBeenCalledWith(
      'auth.account.deactivated',
      expect.objectContaining({ userId: 'u-aluno', actorUserId: 'admin-1' }),
    );

    // Reativa aluno
    const reactivated = await setActive.execute(
      'u-aluno',
      { active: true },
      ACTOR_CTX,
    );
    expect(reactivated.active).toBe(true);
    expect(security.event).toHaveBeenCalledWith(
      'auth.account.reactivated',
      expect.objectContaining({ userId: 'u-aluno', actorUserId: 'admin-1' }),
    );
  });

  it('redefine senha marcando mustChangePassword=true e invalidando cache', async () => {
    const repo = makeInMemoryRepo([
      {
        id: 'u-aluno',
        name: 'Aluno',
        username: 'aluno',
        cpfHash: null,
        cpfEncrypted: null,
        role: Role.TRAINEE,
        pinHash: 'old',
        active: true,
        mustChangePassword: false,
        createdAt: new Date(),
      },
    ]);
    const cache = { invalidate: jest.fn() } as unknown as UserStatusCacheService;
    const security = { event: jest.fn() } as unknown as SecurityLogger;
    const resetPwd = new ResetUserPasswordUseCase(repo, crypto, cache, security);

    await expect(
      resetPwd.execute('u-aluno', { newPassword: '1234' }, ACTOR_CTX),
    ).rejects.toThrow(BadRequestException);

    const res = await resetPwd.execute(
      'u-aluno',
      { newPassword: 'TempReset@99' },
      ACTOR_CTX,
    );
    expect(res.ok).toBe(true);
    expect(res.user.mustChangePassword).toBe(true);
    const stored = await repo.findById('u-aluno');
    expect(await argon2.verify(stored!.pinHash, 'TempReset@99')).toBe(true);
    expect(cache.invalidate).toHaveBeenCalledWith('u-aluno');
    expect(security.event).toHaveBeenCalledWith(
      'auth.password.reset',
      expect.objectContaining({ userId: 'u-aluno', actorUserId: 'admin-1' }),
    );
  });

  it('lista usuários com filtro de papel e active expondo apenas cpfMasked', async () => {
    const repo = makeInMemoryRepo([
      {
        id: 'u-active',
        name: 'Bruno',
        username: 'bruno',
        cpfHash: crypto.hashCpf(CPF_1),
        cpfEncrypted: crypto.encryptCpf(CPF_1, 'u-active'),
        role: Role.TRAINEE,
        pinHash: 'secret',
        active: true,
        mustChangePassword: false,
        createdAt: new Date(),
      },
      {
        id: 'u-inactive',
        name: 'Ana',
        username: 'ana',
        cpfHash: null,
        cpfEncrypted: null,
        role: Role.TRAINEE,
        pinHash: 'secret',
        active: false,
        mustChangePassword: false,
        createdAt: new Date(),
      },
    ]);
    const listUsers = new ListUsersUseCase(repo, crypto);

    const allTrainees = await listUsers.execute(Role.TRAINEE);
    expect(allTrainees.map((u) => u.id)).toEqual(['u-inactive', 'u-active']);
    expect(allTrainees[1]).toMatchObject({
      cpfMasked: '***.982.247-**',
      active: true,
    });
    expect('pinHash' in allTrainees[1]).toBe(false);

    const onlyActive = await listUsers.execute(Role.TRAINEE, true);
    expect(onlyActive.map((u) => u.id)).toEqual(['u-active']);
  });
});
