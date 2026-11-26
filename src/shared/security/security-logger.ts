import { Injectable, Optional } from '@nestjs/common';
import pino, { Logger } from 'pino';
import { AccessLogService } from './access-log.service';

/**
 * Catálogo de eventos de segurança. É um CONTRATO: dashboard (Grafana/LogQL),
 * tabela `AccessLog` e regras de alerta consomem estes nomes — mudar aqui é versionar lá.
 */
export type SecurityEventName =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.login.locked'
  | 'auth.logout'
  | 'auth.unauthorized' // 401 em rota protegida (sem token / expirado / inválido / inativo)
  | 'auth.password.changed' // usuário alterou a própria senha
  | 'auth.password.reset' // admin/portaria redefiniu senha de outra conta
  | 'auth.account.created' // nova conta criada
  | 'auth.account.updated' // dados cadastrais atualizados
  | 'auth.account.deactivated' // conta desativada
  | 'auth.account.reactivated' // conta reativada
  | 'authz.denied' // 403: autenticado, mas papel não permitido
  | 'ratelimit.exceeded'; // 429: estourou o rate limit global

export interface SecurityEventData {
  ip?: string;
  role?: string;
  userId?: string;
  actorUserId?: string;
  identifierMasked?: string;
  userAgent?: string;
  requestId?: string;
  reason?: string;
  attempt?: number;
  retryAfterSec?: number;
  method?: string;
  path?: string;
  statusCode?: number;
  requiredRoles?: string[];
  durationMs?: number;
  scope?: 'ip' | 'global';
}

const INFO_EVENTS: ReadonlySet<SecurityEventName> = new Set([
  'auth.login.success',
  'auth.logout',
  'auth.password.changed',
  'auth.account.created',
  'auth.account.updated',
  'auth.account.reactivated',
]);

/**
 * Logger de eventos de segurança em JSON estruturado (stdout) + auditoria em banco (`AccessLog`).
 * Cada evento sai como uma linha JSON com `kind:"security"`, pronta pra ser
 * coletada por Alloy/Promtail → Loki e analisada em dashboard, e também é persistido
 * de forma assíncrona na tabela `AccessLog` quando `AccessLogService` está disponível.
 *
 * Regras: nunca logar PIN/senha, hash, CPF completo ou token. `reason` é texto fixo, nunca input do usuário.
 */
@Injectable()
export class SecurityLogger {
  private readonly logger: Logger;

  constructor(@Optional() private readonly accessLog?: AccessLogService) {
    this.logger = pino({
      base: { kind: 'security', app: 'ritmo-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    });
  }

  event(name: SecurityEventName, data: SecurityEventData) {
    const level = INFO_EVENTS.has(name) ? 'info' : 'warn';
    this.logger[level]({ event: name, ...data });

    this.accessLog?.record({
      event: name,
      userId: data.userId,
      actorUserId: data.actorUserId,
      identifierMasked: data.identifierMasked,
      ip: data.ip ?? 'unknown',
      userAgent: data.userAgent,
      method: data.method,
      path: data.path,
      statusCode: data.statusCode,
      reason: data.reason,
      requestId: data.requestId,
      durationMs: data.durationMs,
    });
  }
}
