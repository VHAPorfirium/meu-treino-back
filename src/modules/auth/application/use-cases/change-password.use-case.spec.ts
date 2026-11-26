import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { UserStatusCacheService } from '../../../../shared/auth/user-status-cache.service';
import { UserRepository } from '../../../users/domain/user.repository';
import { ChangePasswordUseCase } from './change-password.use-case';

function makeUser(pinHash: string, overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    name: 'Aluna',
    username: 'aluna',
    cpfHash: null,
    cpfEncrypted: null,
    role: Role.TRAINEE,
    pinHash,
    active: true,
    mustChangePassword: true,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ChangePasswordUseCase', () => {
  function createSut(user: User | null) {
    const users = {
      findById: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<UserRepository>;
    const security = { event: jest.fn() } as unknown as jest.Mocked<SecurityLogger>;
    const cache = { invalidate: jest.fn() } as unknown as jest.Mocked<UserStatusCacheService>;
    const useCase = new ChangePasswordUseCase(users, security, cache);
    return { useCase, users, security, cache };
  }

  it('troca senha com sucesso, limpa mustChangePassword, invalida cache e registra auditoria', async () => {
    const oldHash = await argon2.hash('1234', { type: argon2.argon2id });
    const { useCase, users, security, cache } = createSut(makeUser(oldHash));

    const res = await useCase.execute(
      'u1',
      { currentPassword: '1234', newPassword: 'NovaSenha@123' },
      { ip: '127.0.0.1', userAgent: 'Safari', requestId: 'r1' },
    );

    expect(res).toEqual({ ok: true, mustChangePassword: false });
    expect(users.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        mustChangePassword: false,
        pinHash: expect.stringContaining('$argon2id$'),
      }),
    );
    const savedHash = users.update.mock.calls[0][1].pinHash!;
    expect(await argon2.verify(savedHash, 'NovaSenha@123')).toBe(true);
    expect(cache.invalidate).toHaveBeenCalledWith('u1');
    expect(security.event).toHaveBeenCalledWith(
      'auth.password.changed',
      expect.objectContaining({ userId: 'u1', actorUserId: 'u1', statusCode: 200 }),
    );
  });

  it('rejeita senha atual incorreta com 400 (sem derrubar sessão)', async () => {
    const oldHash = await argon2.hash('SenhaAtual@1', { type: argon2.argon2id });
    const { useCase, users } = createSut(makeUser(oldHash));

    await expect(
      useCase.execute(
        'u1',
        { currentPassword: 'Errada@1', newPassword: 'NovaSenha@2' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(users.update).not.toHaveBeenCalled();
  });

  it('rejeita nova senha fraca ou igual à atual', async () => {
    const oldHash = await argon2.hash('SenhaAtual@1', { type: argon2.argon2id });
    const { useCase } = createSut(makeUser(oldHash));

    await expect(
      useCase.execute(
        'u1',
        { currentPassword: 'SenhaAtual@1', newPassword: 'fraca' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      useCase.execute(
        'u1',
        { currentPassword: 'SenhaAtual@1', newPassword: 'SenhaAtual@1' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toThrow('A nova senha deve ser diferente da senha atual');
  });

  it('rejeita conta desativada com 401', async () => {
    const oldHash = await argon2.hash('SenhaAtual@1', { type: argon2.argon2id });
    const { useCase } = createSut(makeUser(oldHash, { active: false }));

    await expect(
      useCase.execute(
        'u1',
        { currentPassword: 'SenhaAtual@1', newPassword: 'NovaSenha@2' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});
