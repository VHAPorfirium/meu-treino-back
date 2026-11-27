import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { SecurityLogger } from '../security/security-logger';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from './allow-pending-password-change.decorator';
import { PasswordChangeRequiredGuard } from './password-change-required.guard';
import { IS_PUBLIC_KEY } from './public.decorator';

function makeContext(user?: {
  userId: string;
  role: Role;
  mustChangePassword: boolean;
}) {
  return {
    getHandler: () => () => undefined,
    getClass: () => class Dummy {},
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        method: 'GET',
        originalUrl: '/api/workouts/mine',
        url: '/api/workouts/mine',
        ip: '127.0.0.1',
        headers: {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('PasswordChangeRequiredGuard', () => {
  it('bloqueia com 403 qualquer rota protegida quando mustChangePassword = true', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const security = { event: jest.fn() } as unknown as SecurityLogger;
    const guard = new PasswordChangeRequiredGuard(reflector, security);

    expect(() =>
      guard.canActivate(
        makeContext({
          userId: 'u1',
          role: Role.TRAINEE,
          mustChangePassword: true,
        }),
      ),
    ).toThrow(ForbiddenException);

    expect(security.event).toHaveBeenCalledWith(
      'authz.denied',
      expect.objectContaining({
        userId: 'u1',
        reason: 'password_change_required',
      }),
    );
  });

  it('libera rotas marcadas com @AllowPendingPasswordChange() ou @Public()', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === ALLOW_PENDING_PASSWORD_CHANGE_KEY) return true;
        return false;
      }),
    } as unknown as Reflector;
    const security = { event: jest.fn() } as unknown as SecurityLogger;
    const guard = new PasswordChangeRequiredGuard(reflector, security);

    expect(
      guard.canActivate(
        makeContext({
          userId: 'u1',
          role: Role.TRAINEE,
          mustChangePassword: true,
        }),
      ),
    ).toBe(true);

    const publicReflector = {
      getAllAndOverride: jest.fn((key: string) => key === IS_PUBLIC_KEY),
    } as unknown as Reflector;
    const publicGuard = new PasswordChangeRequiredGuard(publicReflector, security);
    expect(publicGuard.canActivate(makeContext())).toBe(true);
  });

  it('libera normalmente quando mustChangePassword = false', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const security = { event: jest.fn() } as unknown as SecurityLogger;
    const guard = new PasswordChangeRequiredGuard(reflector, security);

    expect(
      guard.canActivate(
        makeContext({
          userId: 'u1',
          role: Role.PERSONAL,
          mustChangePassword: false,
        }),
      ),
    ).toBe(true);
  });
});
