import 'reflect-metadata';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../../shared/auth/public.decorator';
import { ROLES_KEY } from '../../shared/auth/roles.decorator';
import { HealthController } from './health.controller';

describe('HealthController — controle de acesso', () => {
  it('mantém GET /health público para healthchecks', () => {
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.check);
    expect(isPublic).toBe(true);
  });

  it('restringe GET /health/db exclusivamente a ADMIN (não público e com rate limit)', () => {
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.db);
    const roles = Reflect.getMetadata(ROLES_KEY, HealthController.prototype.db);
    const skipThrottle = Reflect.getMetadata('THROTTLER:SKIPdefault', HealthController.prototype.db);

    expect(isPublic).toBeUndefined();
    expect(roles).toEqual([Role.ADMIN]);
    expect(skipThrottle).toBeUndefined();
  });
});
