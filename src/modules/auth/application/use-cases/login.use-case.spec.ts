import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { LoginThrottleService } from '../../../../shared/security/login-throttle.service';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { UserRepository } from '../../../users/domain/user.repository';
import { LoginUseCase } from './login.use-case';

describe('LoginUseCase — fechamento da janela TOCTOU', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('limita rajada paralela de 10 requisições do mesmo IP a no máximo 5 verificações', async () => {
    const pinHash = await argon2.hash('1234');
    const findAll = jest.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return [{ id: 'u1', name: 'Aluna', role: Role.TRAINEE, pinHash }];
    });
    const users = { findAll } as unknown as UserRepository;
    const jwt = { signAsync: jest.fn().mockResolvedValue('tok') } as unknown as JwtService;
    const security = { event: jest.fn() } as unknown as SecurityLogger;
    const throttle = new LoginThrottleService();

    const useCase = new LoginUseCase(users, jwt, security, throttle);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        useCase.execute({ pin: '0000' }, { ip: '203.0.113.10', requestId: 'req-1' }),
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

    expect(findAll).toHaveBeenCalledTimes(5);
    expect(unauthorized).toHaveLength(5);
    expect(tooMany).toHaveLength(5);
    expect(throttle.status(throttle.key('203.0.113.10')).locked).toBe(true);
  });

  it('libera a vaga reservada se users.findAll falhar com erro inesperado', async () => {
    const users = {
      findAll: jest.fn().mockRejectedValue(new Error('db offline')),
    } as unknown as UserRepository;
    const jwt = { signAsync: jest.fn() } as unknown as JwtService;
    const security = { event: jest.fn() } as unknown as SecurityLogger;
    const throttle = new LoginThrottleService();

    const useCase = new LoginUseCase(users, jwt, security, throttle);

    await expect(
      useCase.execute({ pin: '1234' }, { ip: '203.0.113.99' }),
    ).rejects.toThrow('db offline');

    // Nenhuma falha contabilizada e nenhuma vaga vazada
    const status = throttle.status(throttle.key('203.0.113.99'));
    expect(status).toMatchObject({ locked: false, attempts: 0 });
    expect(throttle.acquireAttempt(throttle.key('203.0.113.99')).locked).toBe(false);
  });
});
