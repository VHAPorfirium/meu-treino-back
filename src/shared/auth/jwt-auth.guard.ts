import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SecurityLogger } from '../security/security-logger';
import { clientIp, requestId } from '../http/client-ip';

/** Traduz o `info` do passport-jwt num motivo estável (nunca texto do usuário). */
function unauthorizedReason(info: unknown): string {
  const name = (info as { name?: string } | undefined)?.name;
  const message = (info as { message?: string } | undefined)?.message ?? '';
  if (name === 'TokenExpiredError') return 'expired';
  if (/no auth token/i.test(message)) return 'no_token';
  return 'invalid';
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly security: SecurityLogger,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  /**
   * Chamado pelo passport após tentar autenticar. Aqui a gente loga o 401
   * (evento `auth.unauthorized`) antes de propagar — o comportamento HTTP não muda.
   */
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const req = context.switchToHttp().getRequest<Request>();
      this.security.event('auth.unauthorized', {
        ip: clientIp(req),
        requestId: requestId(req),
        method: req.method,
        path: req.originalUrl?.split('?')[0] ?? req.url,
        reason: unauthorizedReason(info),
      });
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    return user;
  }
}
