import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { requestId } from './client-ip';

const log = new Logger('HTTP');

/** Rotas de ruído: healthcheck bate de minuto em minuto e não diz nada. */
const IGNORAR = /^\/api\/health/;

/**
 * Duração de cada requisição, correlacionada pelo mesmo `requestId` que o
 * `AllExceptionsFilter` já usa.
 *
 * Existe pra ter o "antes e depois" do cache: sem número, otimização é fé.
 * Loga em WARN acima de 1 s (o que, com o pooler serializando, merece olhada).
 */
export function requestTimingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const path = req.originalUrl?.split('?')[0] ?? req.url;
    if (IGNORAR.test(path)) return;
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const linha = `${req.method} ${path} ${res.statusCode} ${ms.toFixed(0)}ms requestId=${requestId(req) ?? '-'}`;
    if (ms >= 1000) log.warn(linha);
    else log.log(linha);
  });
  next();
}
