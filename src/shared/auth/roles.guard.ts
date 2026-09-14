import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import { AuthUser } from './jwt-payload';
import { SecurityLogger } from '../security/security-logger';
import { clientIp, requestId } from '../http/client-ip';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly security: SecurityLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user || !requiredRoles.includes(user.role)) {
      // 403: autenticado (ou não), mas sem o papel exigido → evento `authz.denied`
      this.security.event('authz.denied', {
        ip: clientIp(req),
        requestId: requestId(req),
        userId: user?.userId,
        role: user?.role,
        requiredRoles,
        method: req.method,
        path: req.originalUrl?.split('?')[0] ?? req.url,
      });
      throw new ForbiddenException(
        'Acesso restrito ao papel: ' + requiredRoles.join(', '),
      );
    }
    return true;
  }
}
