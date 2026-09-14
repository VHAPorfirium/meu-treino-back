import type { Request } from 'express';

/**
 * IP do cliente CONFIÁVEL.
 *
 * Usa `req.ip`, que o Express resolve a partir de `X-Forwarded-For` respeitando a
 * configuração `trust proxy` (setada no main.ts com TRUST_PROXY_HOPS). Assim só os
 * proxies conhecidos à frente da API (Render; Vercel+Render) são confiáveis, e um
 * `X-Forwarded-For` forjado pelo cliente é ignorado.
 *
 * Antes, o código pegava o PRIMEIRO endereço do header — controlado pelo cliente —,
 * o que permitia burlar o lockout por IP mandando um IP diferente a cada request.
 */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

/** request-id da requisição (setado pelo RequestIdMiddleware). */
export function requestId(req: Request): string | undefined {
  return (req as Request & { id?: string }).id;
}
