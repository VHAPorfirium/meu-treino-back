import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { SecurityLogger } from './security-logger';
import { clientIp, requestId } from '../http/client-ip';

/**
 * Intercepta o 429 do rate limit global só pra registrar o evento de segurança
 * `ratelimit.exceeded`. A resposta HTTP continua a mesma do @nestjs/throttler.
 * (Filtro em vez de subclasse do ThrottlerGuard: menos acoplamento ao construtor interno dele.)
 */
@Catch(ThrottlerException)
export class ThrottlerLogFilter implements ExceptionFilter {
  constructor(private readonly security: SecurityLogger) {}

  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    this.security.event('ratelimit.exceeded', {
      ip: clientIp(req),
      requestId: requestId(req),
      method: req.method,
      path: req.originalUrl?.split('?')[0] ?? req.url,
    });

    res.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: exception.message || 'Too Many Requests',
    });
  }
}
