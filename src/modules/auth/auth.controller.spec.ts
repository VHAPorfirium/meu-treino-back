import type { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { AUTH_COOKIE } from '../../shared/auth/jwt.strategy';
import { SecurityLogger } from '../../shared/security/security-logger';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const originalCookieSecure = process.env.COOKIE_SECURE;

  afterEach(() => {
    if (originalCookieSecure === undefined) {
      delete process.env.COOKIE_SECURE;
    } else {
      process.env.COOKIE_SECURE = originalCookieSecure;
    }
  });

  function createSut() {
    const loginUseCase = {
      execute: jest.fn().mockResolvedValue({
        token: 'jwt-token-test',
        user: { id: 'u1', name: 'Aluna', role: Role.TRAINEE },
      }),
    } as unknown as jest.Mocked<LoginUseCase>;
    const security = {
      event: jest.fn(),
    } as unknown as jest.Mocked<SecurityLogger>;
    const controller = new AuthController(loginUseCase, security);
    const req = { ip: '127.0.0.1' } as unknown as Request;
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as jest.Mocked<Response>;
    return { controller, req, res };
  }

  it('usa SameSite=Lax + Secure em produção no login e nas mesmas opções no logout', async () => {
    process.env.COOKIE_SECURE = 'true';
    const { controller, req, res } = createSut();

    await controller.signIn({ pin: '1234' }, req, res);
    expect(res.cookie).toHaveBeenCalledWith(
      AUTH_COOKIE,
      'jwt-token-test',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
      }),
    );

    controller.logout(req, res);
    expect(res.clearCookie).toHaveBeenCalledWith(AUTH_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
  });

  it('usa SameSite=Lax sem Secure em desenvolvimento local', async () => {
    process.env.COOKIE_SECURE = 'false';
    const { controller, req, res } = createSut();

    await controller.signIn({ pin: '1234' }, req, res);
    expect(res.cookie).toHaveBeenCalledWith(
      AUTH_COOKIE,
      'jwt-token-test',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      }),
    );

    controller.logout(req, res);
    expect(res.clearCookie).toHaveBeenCalledWith(AUTH_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });
  });
});
