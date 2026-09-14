import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const HEADER = 'x-request-id';

/**
 * Garante um request-id por requisição (aceita o do cliente/proxy se vier, senão gera)
 * e o devolve no header de resposta. Permite correlacionar um erro visto pelo usuário
 * com o evento de segurança correspondente no Loki.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incoming = req.headers[HEADER];
  const id =
    typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
      ? incoming
      : randomUUID();
  (req as Request & { id?: string }).id = id;
  res.setHeader(HEADER, id);
  next();
}
