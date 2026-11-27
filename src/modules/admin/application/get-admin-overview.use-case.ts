import { Injectable } from '@nestjs/common';
import { LinkStatus, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CacheService } from '../../../shared/cache/cache.service';
import {
  HttpMetricsSnapshot,
  MetricsService,
} from '../../../shared/metrics/metrics.service';
import {
  diaLocal,
  getAppTimezone,
  somarDias,
} from '../../../shared/time/dia-local';

export interface AdminOverviewResponse {
  generatedAt: string;
  externalGrafanaUrl: string | null;
  database: {
    status: 'ok' | 'degraded';
    latencyMs: number;
    tableCount: number;
    migrationsApplied: number;
    migrationsPendingOrFailed: number;
  };
  cache: {
    enabled: boolean;
    entradas: number;
    hits: number;
    misses: number;
    taxaAcerto: number;
    emVoo: number;
  };
  http: HttpMetricsSnapshot;
  academy: {
    users: {
      total: number;
      active: number;
      inactive: number;
      byRole: Record<Role, number>;
      activeByRole: Record<Role, number>;
    };
    links: {
      active: number;
      pending: number;
      traineesWithoutTrainer: number;
    };
    sessions: {
      today: number;
      last7Days: number;
      last30Days: number;
      completedLast30Days: number;
    };
  };
  security: {
    last24h: {
      totalEvents: number;
      loginSuccess: number;
      loginFailure: number;
      loginLocked: number;
      authzDenied: number;
      rateLimitExceeded: number;
      profileSwitched: number;
      passwordResets: number;
    };
    loginDaily7d: {
      day: string;
      success: number;
      failure: number;
      locked: number;
    }[];
    topSuspiciousIps24h: {
      ip: string;
      count: number;
    }[];
  };
}

const OVERVIEW_DB_CACHE_TTL_MS = 15_000;

function resolveGrafanaUrl(): string | null {
  const raw = process.env.ADMIN_GRAFANA_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Consolida a visão de observabilidade, saúde, performance e uso global da plataforma
 * para o painel exclusivo `/admin` (`@Roles(Role.ADMIN)`).
 *
 * Otimizado para pooler restrito (`connection_limit=1`):
 *  - Agregações de `WorkoutLog` unificadas em 1 query SQL (`COUNT(*) FILTER`) usando `WorkoutLog_dayKey_idx`.
 *  - Tendência de logins 7d agregada no PostgreSQL (`GROUP BY` — máximo ~21 linhas, sem risco de OOM).
 *  - Cache global curto de 15s na leitura do banco (métricas HTTP e cache stats vêm em tempo real).
 */
@Injectable()
export class GetAdminOverviewUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly metrics: MetricsService,
  ) {}

  async execute(windowMinutes = 1440): Promise<AdminOverviewResponse> {
    const now = new Date();
    const dbPart =
      typeof this.cache.lembrarGlobal === 'function'
        ? await this.cache.lembrarGlobal(
            'admin:overview:db:v1',
            OVERVIEW_DB_CACHE_TTL_MS,
            () => this.loadDatabaseSummary(now),
          )
        : await this.loadDatabaseSummary(now);

    const cacheStats = await this.cache.estatisticas();

    return {
      generatedAt: now.toISOString(),
      externalGrafanaUrl: resolveGrafanaUrl(),
      database: dbPart.database,
      cache: cacheStats,
      http: this.metrics.getSnapshot(windowMinutes),
      academy: dbPart.academy,
      security: dbPart.security,
    };
  }

  private async loadDatabaseSummary(now: Date): Promise<{
    database: AdminOverviewResponse['database'];
    academy: AdminOverviewResponse['academy'];
    security: AdminOverviewResponse['security'];
  }> {
    const tz = getAppTimezone();
    const todayKey = diaLocal(now, tz);
    const since7Key = somarDias(todayKey, -6);
    const since30Key = somarDias(todayKey, -29);
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      dbHealth,
      userGroups,
      linkGroups,
      traineesWithoutTrainer,
      sessionStatsRows,
      security24hGroups,
      loginDailyRows,
      suspiciousIpsRaw,
    ] = await Promise.all([
      this.checkDatabase(),
      this.prisma.user.groupBy({
        by: ['role', 'active'],
        _count: { _all: true },
      }),
      this.prisma.trainerTraineeLink.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.user.count({
        where: {
          role: Role.TRAINEE,
          active: true,
          traineeLinks: { none: { status: LinkStatus.ACTIVE } },
        },
      }),
      this.prisma.$queryRaw<
        {
          today: bigint | number;
          last7: bigint | number;
          last30: bigint | number;
          completed30: bigint | number;
        }[]
      >`
        SELECT
          COUNT(*) FILTER (WHERE "dayKey" = ${todayKey}) AS "today",
          COUNT(*) FILTER (WHERE "dayKey" >= ${since7Key}) AS "last7",
          COUNT(*) FILTER (WHERE "dayKey" >= ${since30Key}) AS "last30",
          COUNT(*) FILTER (WHERE "dayKey" >= ${since30Key} AND "completed" = true) AS "completed30"
        FROM "WorkoutLog"
        WHERE "dayKey" >= ${since30Key}
      `,
      this.prisma.accessLog.groupBy({
        by: ['event'],
        where: { createdAt: { gte: since24h } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<
        { day: string; event: string; count: bigint | number }[]
      >`
        SELECT
          TO_CHAR(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS "day",
          "event",
          COUNT(*) AS "count"
        FROM "AccessLog"
        WHERE "createdAt" >= ${since7d}
          AND "event" IN ('auth.login.success', 'auth.login.failure', 'auth.login.locked')
        GROUP BY 1, 2
      `,
      this.prisma.accessLog.groupBy({
        by: ['ip'],
        where: {
          createdAt: { gte: since24h },
          event: {
            in: [
              'auth.login.failure',
              'auth.login.locked',
              'ratelimit.exceeded',
              'authz.denied',
            ],
          },
        },
        _count: { _all: true },
        orderBy: { _count: { ip: 'desc' } },
        take: 5,
      }),
    ]);

    const byRole: Record<Role, number> = {
      ADMIN: 0,
      RECEPTION: 0,
      PERSONAL: 0,
      TRAINEE: 0,
    };
    const activeByRole: Record<Role, number> = {
      ADMIN: 0,
      RECEPTION: 0,
      PERSONAL: 0,
      TRAINEE: 0,
    };
    let totalUsers = 0;
    let activeUsers = 0;

    for (const row of userGroups) {
      const count = row._count._all;
      totalUsers += count;
      byRole[row.role] = (byRole[row.role] ?? 0) + count;
      if (row.active) {
        activeUsers += count;
        activeByRole[row.role] = (activeByRole[row.role] ?? 0) + count;
      }
    }

    let activeLinks = 0;
    let pendingLinks = 0;
    for (const row of linkGroups) {
      if (row.status === LinkStatus.ACTIVE) activeLinks = row._count._all;
      else if (row.status === LinkStatus.PENDING) pendingLinks = row._count._all;
    }

    const sRow = sessionStatsRows[0];
    const sessions = {
      today: Number(sRow?.today ?? 0),
      last7Days: Number(sRow?.last7 ?? 0),
      last30Days: Number(sRow?.last30 ?? 0),
      completedLast30Days: Number(sRow?.completed30 ?? 0),
    };

    const secMap = new Map<string, number>();
    let totalSecEvents = 0;
    for (const row of security24hGroups) {
      secMap.set(row.event, row._count._all);
      totalSecEvents += row._count._all;
    }

    const dailyMap = new Map<
      string,
      { day: string; success: number; failure: number; locked: number }
    >();
    const dayKeys: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const key = somarDias(todayKey, -i);
      dayKeys.push(key);
      dailyMap.set(key, { day: key, success: 0, failure: 0, locked: 0 });
    }
    for (const row of loginDailyRows) {
      const bucket = dailyMap.get(row.day);
      if (!bucket) continue;
      const n = Number(row.count ?? 0);
      if (row.event === 'auth.login.success') bucket.success += n;
      else if (row.event === 'auth.login.failure') bucket.failure += n;
      else if (row.event === 'auth.login.locked') bucket.locked += n;
    }

    const topSuspiciousIps24h = suspiciousIpsRaw.map((row) => ({
      ip: row.ip,
      count: row._count._all,
    }));

    return {
      database: dbHealth,
      academy: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
          byRole,
          activeByRole,
        },
        links: {
          active: activeLinks,
          pending: pendingLinks,
          traineesWithoutTrainer,
        },
        sessions,
      },
      security: {
        last24h: {
          totalEvents: totalSecEvents,
          loginSuccess: secMap.get('auth.login.success') ?? 0,
          loginFailure: secMap.get('auth.login.failure') ?? 0,
          loginLocked: secMap.get('auth.login.locked') ?? 0,
          authzDenied: secMap.get('authz.denied') ?? 0,
          rateLimitExceeded: secMap.get('ratelimit.exceeded') ?? 0,
          profileSwitched: secMap.get('auth.profile.switched') ?? 0,
          passwordResets: secMap.get('auth.password.reset') ?? 0,
        },
        loginDaily7d: dayKeys.map((k) => dailyMap.get(k)!),
        topSuspiciousIps24h,
      },
    };
  }

  private async checkDatabase(): Promise<AdminOverviewResponse['database']> {
    const startNs = process.hrtime.bigint();
    try {
      const [tables, migs] = await Promise.all([
        this.prisma.$queryRaw<{ table_name: string }[]>`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
        `,
        this.prisma.$queryRaw<
          { finished_at: Date | null; rolled_back_at: Date | null }[]
        >`
          SELECT finished_at, rolled_back_at FROM "_prisma_migrations"
        `,
      ]);
      const latencyMs =
        Math.round((Number(process.hrtime.bigint() - startNs) / 1e6) * 10) / 10;
      const migrationsApplied = migs.filter(
        (m) => Boolean(m.finished_at) && !m.rolled_back_at,
      ).length;
      // Conta apenas migrations efetivamente pendentes/falhas sem rollback resolvido
      const migrationsPendingOrFailed = migs.filter(
        (m) => !m.finished_at && !m.rolled_back_at,
      ).length;

      return {
        status: migrationsPendingOrFailed === 0 ? 'ok' : 'degraded',
        latencyMs,
        tableCount: tables.length,
        migrationsApplied,
        migrationsPendingOrFailed,
      };
    } catch {
      const latencyMs =
        Math.round((Number(process.hrtime.bigint() - startNs) / 1e6) * 10) / 10;
      return {
        status: 'degraded',
        latencyMs,
        tableCount: 0,
        migrationsApplied: 0,
        migrationsPendingOrFailed: 1,
      };
    }
  }
}
