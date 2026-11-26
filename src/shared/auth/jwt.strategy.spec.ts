import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatusCacheService } from './user-status-cache.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy + UserStatusCacheService', () => {
  it('retorna usuário ativo do cache e derruba acesso imediatamente após invalidate()', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'u1',
        role: Role.TRAINEE,
        name: 'Gabriel Silva',
        username: 'gabriel.silva',
        active: true,
        mustChangePassword: false,
      })
      .mockResolvedValueOnce({
        id: 'u1',
        role: Role.TRAINEE,
        name: 'Gabriel Silva',
        username: 'gabriel.silva',
        active: false,
        mustChangePassword: false,
      });

    const prisma = { user: { findUnique } } as unknown as PrismaService;
    const cache = new UserStatusCacheService(prisma);
    const strategy = new JwtStrategy(cache);

    const payload = { sub: 'u1', role: Role.TRAINEE, name: 'Gabriel Silva' };

    // 1ª chamada vai ao banco; 2ª usa o cache em memória (1 query total)
    const first = await strategy.validate(payload);
    const second = await strategy.validate(payload);
    expect(first).toEqual({
      userId: 'u1',
      role: Role.TRAINEE,
      name: 'Gabriel Silva',
      username: 'gabriel.silva',
      mustChangePassword: false,
    });
    expect(second).toEqual(first);
    expect(findUnique).toHaveBeenCalledTimes(1);

    // Após desativação + invalidate(userId), a próxima requisição já é bloqueada com 401
    cache.invalidate('u1');
    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('rejeita token cujo usuário foi removido do banco', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const strategy = new JwtStrategy(new UserStatusCacheService(prisma));

    await expect(
      strategy.validate({ sub: 'missing', role: Role.TRAINEE, name: 'X' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
