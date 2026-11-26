import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { SecurityLogger } from '../security/security-logger';
import { clientIp, requestId, userAgent } from './client-ip';

/**
 * Filtro global de exceções.
 *
 * Por que existe: sem ele, qualquer erro não-HTTP vira um `{"statusCode":500,
 * "message":"Internal server error"}` opaco e a causa real (ex.: código de erro do
 * Prisma) fica invisível. Aqui todo 5xx é logado com `requestId`, rota, nome/mensagem,
 * `code`/`meta` do Prisma e stack — e o `requestId` volta na resposta, então dá pra
 * casar o erro que o usuário viu com a linha exata no log.
 *
 * Também registra o 429 do rate limit como evento de segurança (`ratelimit.exceeded`),
 * substituindo o antigo ThrottlerLogFilter — um filtro só, sem ambiguidade de ordem.
 */
const PRISMA_ERROR_MAP: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Registro já existe' },
  P2003: { status: HttpStatus.BAD_REQUEST, message: 'Referência inválida' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Registro não encontrado' },
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Exceptions');

  constructor(private readonly security: SecurityLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    if (res.headersSent) return;

    const rid = requestId(req);
    const method = req.method;
    const path = req.originalUrl?.split('?')[0] ?? req.url;

    const isHttp = exception instanceof HttpException;
    const prismaCode =
      !isHttp && exception && typeof exception === 'object'
        ? (exception as { code?: unknown }).code
        : undefined;
    const mappedPrisma =
      typeof prismaCode === 'string' ? PRISMA_ERROR_MAP[prismaCode] : undefined;

    const status = isHttp
      ? exception.getStatus()
      : (mappedPrisma?.status ?? HttpStatus.INTERNAL_SERVER_ERROR);

    // 429 do rate limit global → evento de segurança (Frente B)
    if (exception instanceof ThrottlerException) {
      this.security.event('ratelimit.exceeded', {
        ip: clientIp(req),
        userAgent: userAgent(req),
        requestId: rid,
        method,
        path,
        statusCode: 429,
        reason: 'rate_limit',
      });
    }

    // 5xx: loga a causa REAL (é o que faltava pra diagnosticar)
    if (status >= 500) {
      const e = exception as {
        name?: string;
        message?: string;
        code?: string;
        meta?: unknown;
        stack?: string;
      };
      const detalhes = [
        `${method} ${path}`,
        `requestId=${rid ?? '-'}`,
        `${e?.name ?? 'Error'}: ${e?.message ?? String(exception)}`,
        e?.code ? `code=${e.code}` : null,
        e?.meta ? `meta=${JSON.stringify(e.meta)}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      this.log.error(detalhes, e?.stack);
    }

    // corpo da resposta: preserva o do Nest e acrescenta o requestId
    const payload = isHttp ? exception.getResponse() : null;
    const base =
      payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : {
            statusCode: status,
            message:
              typeof payload === 'string'
                ? payload
                : (mappedPrisma?.message ?? 'Internal server error'),
          };

    res.status(status).json({ ...base, requestId: rid });
  }
}
