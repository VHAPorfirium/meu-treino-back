import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SecurityLogger } from '../security/security-logger';
import { clientIp, requestId, userAgent } from '../http/client-ip';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from './allow-pending-password-change.decorator';
import type { AuthUser } from './jwt-payload';

/**
 * Impõe `mustChangePassword = true` no backend (não apenas no frontend).
 * Bloqueia com 403 qualquer rota protegida enquanto o usuário não concluir a troca
 * obrigatória de senha em `POST /api/auth/change-password`.
 */
@Injectable()
export class PasswordChangeRequiredGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly security: SecurityLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_CHANGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (req.user?.mustChangePassword) {
      this.security.event('authz.denied', {
        ip: clientIp(req),
        userAgent: userAgent(req),
        requestId: requestId(req),
        userId: req.user.userId,
        role: req.user.role,
        method: req.method,
        path: (req.originalUrl ?? req.url).split('?')[0],
        statusCode: 403,
        reason: 'password_change_required',
      });
      throw new ForbiddenException(
        'Troca de senha obrigatória pendente. Altere sua senha para continuar.',
      );
    }

    return true;
  }
}
