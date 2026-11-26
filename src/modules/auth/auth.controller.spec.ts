import type { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { AUTH_COOKIE } from '../../shared/auth/jwt.strategy';
import { SecurityLogger } from '../../shared/security/security-logger';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { SwitchProfileUseCase } from './application/use-cases/switch-profile.use-case';
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
        user: {
          id: 'u1',
          name: 'Aluna',
          username: 'aluna',
          role: Role.TRAINEE,
          mustChangePassword: false,
        },
      }),
    } as unknown as jest.Mocked<LoginUseCase>;
    const changePasswordUseCase = {
      execute: jest.fn().mockResolvedValue({ ok: true, mustChangePassword: false }),
    } as unknown as jest.Mocked<ChangePasswordUseCase>;
    const switchProfileUseCase = {
      listLinkedProfiles: jest.fn().mockResolvedValue([]),
      execute: jest.fn().mockResolvedValue({
        token: 'switched-jwt',
        user: {
          id: 'u2',
          name: 'Personal',
          username: 'victor.personal',
          role: Role.PERSONAL,
          mustChangePassword: false,
        },
      }),
    } as unknown as jest.Mocked<SwitchProfileUseCase>;
    const security = {
      event: jest.fn(),
    } as unknown as jest.Mocked<SecurityLogger>;
    const controller = new AuthController(
      loginUseCase,
      changePasswordUseCase,
      switchProfileUseCase,
      security,
    );
    const req = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'JestTest/1.0' },
    } as unknown as Request;
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as jest.Mocked<Response>;
    return { controller, loginUseCase, changePasswordUseCase, switchProfileUseCase, req, res };
  }

  it('usa SameSite=Lax + Secure em produção no login e nas mesmas opções no logout', async () => {
    process.env.COOKIE_SECURE = 'true';
    const { controller, req, res } = createSut();

    await controller.signIn(
      { identifier: '52998224725', password: 'Password@1' },
      req,
      res,
    );
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

  it('não seta cookie quando o login exige seleção de perfil (CPF duplo)', async () => {
    const { controller, loginUseCase, req, res } = createSut();
    loginUseCase.execute.mockResolvedValueOnce({
      requiresProfileSelection: true,
      profiles: [
        { role: Role.PERSONAL, name: 'Victor Personal', username: 'victor.personal' },
        { role: Role.TRAINEE, name: 'Victor Hugo', username: 'victor.hugo' },
      ],
    });

    const body = await controller.signIn(
      { identifier: '52998224725', password: 'Password@1' },
      req,
      res,
    );
    expect(res.cookie).not.toHaveBeenCalled();
    expect(body).toMatchObject({ requiresProfileSelection: true });
  });

  it('emite novo cookie httpOnly ao alternar perfil via POST /auth/switch-profile', async () => {
    process.env.COOKIE_SECURE = 'false';
    const { controller, req, res } = createSut();

    const body = await controller.switchProfile(
      {
        userId: 'u1',
        role: Role.TRAINEE,
        name: 'Aluna',
        username: 'aluna',
        mustChangePassword: false,
      },
      { role: Role.PERSONAL },
      req,
      res,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      AUTH_COOKIE,
      'switched-jwt',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: false }),
    );
    expect(body).toEqual({
      user: {
        id: 'u2',
        name: 'Personal',
        username: 'victor.personal',
        role: Role.PERSONAL,
        mustChangePassword: false,
      },
    });
  });

  it('delega troca de senha autenticada para ChangePasswordUseCase', async () => {
    const { controller, changePasswordUseCase, req } = createSut();

    const result = await controller.changePassword(
      {
        userId: 'u1',
        role: Role.TRAINEE,
        name: 'Aluna',
        username: 'aluna',
        mustChangePassword: true,
      },
      { currentPassword: '1234', newPassword: 'NovaSenha@1' },
      req,
    );

    expect(result).toEqual({ ok: true, mustChangePassword: false });
    expect(changePasswordUseCase.execute).toHaveBeenCalledWith(
      'u1',
      { currentPassword: '1234', newPassword: 'NovaSenha@1' },
      expect.objectContaining({ ip: '127.0.0.1', userAgent: 'JestTest/1.0' }),
    );
  });
});
