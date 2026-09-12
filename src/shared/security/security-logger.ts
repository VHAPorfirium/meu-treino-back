import { Injectable } from '@nestjs/common';
import pino, { Logger } from 'pino';

export type SecurityEventName =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.login.locked'
  | 'auth.logout';

export interface SecurityEventData {
  ip?: string;
  role?: string;
  userId?: string;
  requestId?: string;
  reason?: string;
  attempt?: number;
}

/**
 * Logger de eventos de segurança em JSON estruturado (stdout).
 * Cada evento sai como uma linha JSON com `kind:"security"`, pronta pra ser
 * coletada por Promtail/Loki ou Filebeat/ELK e analisada em dashboard.
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
    const level = name === 'auth.login.success' || name === 'auth.logout'
      ? 'info'
      : 'warn';
    this.logger[level]({ event: name, ...data });
  }
}
