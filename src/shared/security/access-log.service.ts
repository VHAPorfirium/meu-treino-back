import { Injectable, Logger } from '@nestjs/common';
import type { AccessLog, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessLogInput {
  event: string;
  userId?: string;
  actorUserId?: string;
  identifierMasked?: string;
  ip: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  reason?: string;
  requestId?: string;
  durationMs?: number;
}

export interface ListAccessLogsQuery {
  event?: string;
  userId?: string;
  actorUserId?: string;
  ip?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface AccessLogPage {
  items: AccessLog[];
  total: number;
  limit: number;
  offset: number;
}

const RETENTION_DAYS = 90;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function clip(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Serviço de auditoria persistida em PostgreSQL (`AccessLog`).
 *
 * Princípios:
 * - Gravação não-bloqueante (`record` dispara em background e captura qualquer erro
 *   do banco para nunca degradar nem derrubar o fluxo HTTP de login/API).
 * - Nunca grava senha, hash, CPF completo ou token (apenas `identifierMasked`).
 * - Aplica política de retenção automática de 90 dias (poda throttled a cada 24h)
 *   para manter a tabela enxuta mesmo em produção contínua.
 */
@Injectable()
export class AccessLogService {
  private readonly log = new Logger(AccessLogService.name);
  private lastPruneAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  /** Enfileira persistência assíncrona sem bloquear o caller. */
  record(entry: AccessLogInput): void {
    void this.write(entry);
  }

  /** Persiste um registro de acesso e dispara limpeza de retenção quando devido. */
  async write(entry: AccessLogInput): Promise<void> {
    try {
      await this.prisma.accessLog.create({
        data: {
          event: entry.event.slice(0, 64),
          userId: entry.userId ?? null,
          actorUserId: entry.actorUserId ?? null,
          identifierMasked: clip(entry.identifierMasked, 64),
          ip: (entry.ip || 'unknown').slice(0, 64),
          userAgent: clip(entry.userAgent, 256),
          method: clip(entry.method, 16),
          path: clip(entry.path, 256),
          statusCode: entry.statusCode ?? null,
          reason: clip(entry.reason, 128),
          requestId: clip(entry.requestId, 64),
          durationMs:
            typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs)
              ? Math.max(0, Math.round(entry.durationMs))
              : null,
        },
      });
    } catch (err) {
      this.log.warn(
        `Falha ao persistir AccessLog (${entry.event}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    const now = Date.now();
    if (now - this.lastPruneAt >= PRUNE_INTERVAL_MS) {
      this.lastPruneAt = now;
      void this.pruneOlderThan(RETENTION_DAYS).catch((err) => {
        this.log.warn(
          `Falha ao podar AccessLog antigo: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    }
  }

  /** Remove registros com mais de `days` dias (padrão: 90 dias). */
  async pruneOlderThan(days = RETENTION_DAYS): Promise<number> {
    const cutoff = new Date(Date.now() - Math.max(1, days) * DAY_MS);
    const { count } = await this.prisma.accessLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.log.log(`Retenção AccessLog: ${count} registros anteriores a ${days}d removidos.`);
    }
    return count;
  }

  /** Consulta paginada para auditoria e observabilidade (consumida no painel /admin). */
  async list(query: ListAccessLogsQuery = {}): Promise<AccessLogPage> {
    const limit = Math.min(200, Math.max(1, Math.trunc(query.limit ?? 50)));
    const offset = Math.max(0, Math.trunc(query.offset ?? 0));

    const where: Prisma.AccessLogWhereInput = {};
    if (query.event) where.event = query.event;
    if (query.userId) where.userId = query.userId;
    if (query.actorUserId) where.actorUserId = query.actorUserId;
    if (query.ip) where.ip = query.ip;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.accessLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.accessLog.count({ where }),
    ]);

    return { items, total, limit, offset };
  }
}
