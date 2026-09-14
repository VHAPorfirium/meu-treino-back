import { Injectable } from '@nestjs/common';
import pino, { Logger } from 'pino';

/**
 * Catálogo de eventos de segurança. É um CONTRATO: dashboard (Grafana/LogQL)
 * e regras de alerta consomem estes nomes — mudar aqui é versionar lá.
 */
export type SecurityEventName =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.login.locked'
  | 'auth.logout'
  | 'auth.unauthorized' // 401 em rota protegida (sem token / expirado / inválido)
  | 'authz.denied' // 403: autenticado, mas papel não permitido
  | 'ratelimit.exceeded'; // 429: estourou o rate limit global

export interface SecurityEventData {
  ip?: string;
  role?: string;
  userId?: string;
  requestId?: string;
  reason?: string;
  attempt?: number;
  retryAfterSec?: number;
  method?: string;
  path?: string;
  requiredRoles?: string[];
  durationMs?: number;
  scope?: 'ip' | 'global';
}

const INFO_EVENTS: ReadonlySet<SecurityEventName> = new Set([
  'auth.login.success',
  'auth.logout',
]);

/**
 * Logger de eventos de segurança em JSON estruturado (stdout).
 * Cada evento sai como uma linha JSON com `kind:"security"`, pronta pra ser
 * coletada por Alloy/Promtail → Loki e analisada em dashboard.
 *
 * Regras: nunca logar PIN, hash ou token. `reason` é texto fixo, nunca input do usuário.
 */
@Injectable()
export class SecurityLogger {
  private readonly logger: Logger;

  constructor() {
    this.logger = pino({
      base: { kind: 'security', app: 'ritmo-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    });
  }

  event(name: SecurityEventName, data: SecurityEventData) {
    const level = INFO_EVENTS.has(name) ? 'info' : 'warn';
    this.logger[level]({ event: name, ...data });
  }
}
