import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { UserRepository } from '../../../users/domain/user.repository';
import { SwitchProfileUseCase } from './switch-profile.use-case';

function makeUser(overrides: Partial<User>): User {
  return {
    id: 'u1',
    name: 'Victor',
    username: 'victor',
    cpfHash: 'cpf-hash-1',
    cpfEncrypted: 'enc',
    role: Role.PERSONAL,
    pinHash: 'hash',
    active: true,
    mustChangePassword: false,
    tokenVersion: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('SwitchProfileUseCase', () => {
  const personal = makeUser({ id: 'u-pers', username: 'victor.personal', role: Role.PERSONAL });
  const trainee = makeUser({ id: 'u-alun', username: 'victor.hugo', role: Role.TRAINEE });
  const reception = makeUser({ id: 'u-rec', username: 'portaria', role: Role.RECEPTION });
  const admin = makeUser({ id: 'u-adm', username: 'admin', role: Role.ADMIN });

  function createSut(all: User[]) {
    const users = {
      findById: jest.fn().mockImplementation(async (id) => all.find((u) => u.id === id) ?? null),
      findManyByCpfHash: jest
        .fn()
        .mockImplementation(async (h) => all.filter((u) => u.cpfHash === h)),
    } as unknown as jest.Mocked<UserRepository>;
    const jwt = { signAsync: jest.fn().mockResolvedValue('switched-jwt') } as unknown as JwtService;
    const security = { event: jest.fn() } as unknown as SecurityLogger;
    return { useCase: new SwitchProfileUseCase(users, jwt, security), security };
  }

  it('lista perfis irmãos ativos e alterna entre PERSONAL e TRAINEE mantendo auditoria', async () => {
    const { useCase, security } = createSut([personal, trainee]);

    const linked = await useCase.listLinkedProfiles('u-pers');
    expect(linked).toEqual([
      { role: Role.TRAINEE, name: 'Victor', username: 'victor.hugo' },
    ]);

    const switched = await useCase.execute('u-pers', Role.TRAINEE, { ip: '127.0.0.1' });
    expect(switched).toEqual({
      token: 'switched-jwt',
      user: {
        id: 'u-alun',
        name: 'Victor',
        username: 'victor.hugo',
        role: Role.TRAINEE,
        mustChangePassword: false,
      },
    });
    expect(security.event).toHaveBeenCalledWith(
      'auth.profile.switched',
      expect.objectContaining({ userId: 'u-alun', actorUserId: 'u-pers', role: Role.TRAINEE }),
    );
  });

  it('bloqueia estritamente qualquer troca envolvendo ADMIN ou RECEPTION', async () => {
    const { useCase } = createSut([personal, trainee, reception, admin]);

    expect(await useCase.listLinkedProfiles('u-adm')).toEqual([]);
    expect(await useCase.listLinkedProfiles('u-rec')).toEqual([]);
    expect(await useCase.listLinkedProfiles('u-alun')).toEqual([
      { role: Role.PERSONAL, name: 'Victor', username: 'victor.personal' },
    ]);
    await expect(
      useCase.execute('u-pers', Role.ADMIN, { ip: '127.0.0.1' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      useCase.execute('u-adm', Role.TRAINEE, { ip: '127.0.0.1' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      useCase.execute('u-alun', Role.RECEPTION, { ip: '127.0.0.1' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      useCase.execute('u-rec', Role.TRAINEE, { ip: '127.0.0.1' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('bloqueia troca de perfil enquanto mustChangePassword = true', async () => {
    const pendingTrainee = { ...trainee, mustChangePassword: true };
    const { useCase } = createSut([personal, pendingTrainee]);

    expect(await useCase.listLinkedProfiles('u-alun')).toEqual([]);
    await expect(
      useCase.execute('u-alun', Role.PERSONAL, { ip: '127.0.0.1' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('não permite alternar para perfil irmão desativado', async () => {
    const inactiveTrainee = { ...trainee, active: false };
    const { useCase } = createSut([personal, inactiveTrainee]);

    expect(await useCase.listLinkedProfiles('u-pers')).toEqual([]);
    await expect(
      useCase.execute('u-pers', Role.TRAINEE, { ip: '127.0.0.1' }),
    ).rejects.toThrow(NotFoundException);
  });
});
