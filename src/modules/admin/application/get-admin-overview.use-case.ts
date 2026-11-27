import { Injectable } from '@nestjs/common';
import { LinkStatus, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CacheService } from '../../../shared/cache/cache.service';
import {
  HttpMetricsSnapshot,
  MetricsService,
} from '../../../shared/metrics/metrics.service';
import { diaLocal, somarDias } from '../../../shared/time/dia-local';

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
    const todayKey = diaLocal(now);
    const since7Key = somarDias(todayKey, -6);
    const since30Key = somarDias(todayKey, -29);
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      dbHealth,
      cacheStats,
      userGroups,
      linkGroups,
      traineesWithoutTrainer,
      sessionsToday,
      sessions7d,
      sessions30d,
      completed30d,
      security24hGroups,
      loginLogs7d,
      suspiciousIpsRaw,
    ] = await Promise.all([
      this.checkDatabase(),
      this.cache.estatisticas(),
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
      this.prisma.workoutLog.count({ where: { dayKey: todayKey } }),
      this.prisma.workoutLog.count({ where: { dayKey: { gte: since7Key } } }),
      this.prisma.workoutLog.count({ where: { dayKey: { gte: since30Key } } }),
      this.prisma.workoutLog.count({
        where: { dayKey: { gte: since30Key }, completed: true },
      }),
      this.prisma.accessLog.groupBy({
        by: ['event'],
        where: { createdAt: { gte: since24h } },
        _count: { _all: true },
      }),
      this.prisma.accessLog.findMany({
        where: {
          createdAt: { gte: since7d },
          event: {
            in: ['auth.login.success', 'auth.login.failure', 'auth.login.locked'],
          },
        },
        select: { event: true, createdAt: true },
      }),
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

    const secMap = new Map<string, number>();
    let totalSecEvents = 0;
    for (const row of security24hGroups) {
      secMap.set(row.event, row._count._all);
      totalSecEvents += row._count._all;
    }

    // Tendência diária de logins (últimos 7 dias locais)
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
    for (const row of loginLogs7d) {
      const key = diaLocal(row.createdAt);
      const bucket = dailyMap.get(key);
      if (!bucket) continue;
      if (row.event === 'auth.login.success') bucket.success += 1;
      else if (row.event === 'auth.login.failure') bucket.failure += 1;
      else if (row.event === 'auth.login.locked') bucket.locked += 1;
    }

    const topSuspiciousIps24h = suspiciousIpsRaw.map((row) => ({
      ip: row.ip,
      count: row._count._all,
    }));

    return {
      generatedAt: now.toISOString(),
      externalGrafanaUrl: resolveGrafanaUrl(),
      database: dbHealth,
      cache: cacheStats,
      http: this.metrics.getSnapshot(windowMinutes),
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
        sessions: {
          today: sessionsToday,
          last7Days: sessions7d,
          last30Days: sessions30d,
          completedLast30Days: completed30d,
        },
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
      const migrationsPendingOrFailed = migs.length - migrationsApplied;

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
