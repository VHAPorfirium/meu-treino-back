import { LinkStatus, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CacheService } from '../../../shared/cache/cache.service';
import { MetricsService } from '../../../shared/metrics/metrics.service';
import { diaLocal } from '../../../shared/time/dia-local';
import { GetAdminOverviewUseCase } from './get-admin-overview.use-case';

function makePrismaMock(opts?: {
  migs?: { finished_at: Date | null; rolled_back_at: Date | null }[];
}) {
  const todayKey = diaLocal(new Date());
  const migs = opts?.migs ?? [
    { finished_at: new Date(), rolled_back_at: null },
    { finished_at: new Date(), rolled_back_at: null },
    // Migration que falhou antes mas já foi marcada como rolled_back (resolvida)
    { finished_at: null, rolled_back_at: new Date() },
  ];

  return {
    $queryRaw: jest
      .fn()
      // Ordem de chamada dentro de Promise.all:
      // 1. checkDatabase -> tables
      // 2. checkDatabase -> _prisma_migrations
      // 3. sessionStatsRows (COUNT FILTER)
      // 4. loginDailyRows (GROUP BY day, event)
      .mockResolvedValueOnce([{ table_name: 'User' }, { table_name: 'AccessLog' }])
      .mockResolvedValueOnce(migs)
      .mockResolvedValueOnce([
        { today: 5n, last7: 28n, last30: 110n, completed30: 96n },
      ])
      .mockResolvedValueOnce([
        { day: todayKey, event: 'auth.login.success', count: 10n },
        { day: todayKey, event: 'auth.login.failure', count: 2n },
        { day: todayKey, event: 'auth.login.locked', count: 1n },
      ]),
    user: {
      groupBy: jest.fn().mockResolvedValue([
        { role: Role.ADMIN, active: true, _count: { _all: 1 } },
        { role: Role.RECEPTION, active: true, _count: { _all: 1 } },
        { role: Role.PERSONAL, active: true, _count: { _all: 2 } },
        { role: Role.PERSONAL, active: false, _count: { _all: 1 } },
        { role: Role.TRAINEE, active: true, _count: { _all: 10 } },
        { role: Role.TRAINEE, active: false, _count: { _all: 2 } },
      ]),
      count: jest.fn().mockResolvedValue(3),
    },
    trainerTraineeLink: {
      groupBy: jest.fn().mockResolvedValue([
        { status: LinkStatus.ACTIVE, _count: { _all: 7 } },
        { status: LinkStatus.PENDING, _count: { _all: 2 } },
        { status: LinkStatus.ENDED, _count: { _all: 4 } },
      ]),
    },
    accessLog: {
      groupBy: jest
        .fn()
        .mockResolvedValueOnce([
          { event: 'auth.login.success', _count: { _all: 18 } },
          { event: 'auth.login.failure', _count: { _all: 4 } },
          { event: 'auth.login.locked', _count: { _all: 1 } },
          { event: 'authz.denied', _count: { _all: 2 } },
          { event: 'auth.profile.switched', _count: { _all: 3 } },
        ])
        .mockResolvedValueOnce([{ ip: '198.51.100.42', _count: { _all: 5 } }]),
    },
  };
}

function makeCacheMock() {
  const store = new Map<string, unknown>();
  return {
    estatisticas: jest.fn().mockResolvedValue({
      enabled: true,
      entradas: 12,
      hits: 80,
      misses: 20,
      taxaAcerto: 80,
      emVoo: 0,
    }),
    lembrarGlobal: jest.fn(
      async <T>(chave: string, _ttlMs: number, produtor: () => Promise<T>) => {
        if (store.has(chave)) return store.get(chave) as T;
        const val = await produtor();
        store.set(chave, val);
        return val;
      },
    ),
  };
}

describe('GetAdminOverviewUseCase', () => {
  const prevGrafana = process.env.ADMIN_GRAFANA_URL;

  afterEach(() => {
    if (prevGrafana === undefined) delete process.env.ADMIN_GRAFANA_URL;
    else process.env.ADMIN_GRAFANA_URL = prevGrafana;
  });

  it('consolida saúde, cache, métricas HTTP, contadores da academia e segurança via SQL agregado', async () => {
    process.env.ADMIN_GRAFANA_URL = 'https://grafana.ritmo.app/d/overview';

    const prisma = makePrismaMock();
    const cache = makeCacheMock();
    const metrics = new MetricsService();
    metrics.record({
      method: 'GET',
      route: '/api/workouts/mine',
      statusCode: 200,
      durationMs: 32,
    });

    const useCase = new GetAdminOverviewUseCase(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
      metrics,
    );

    const overview = await useCase.execute(1440);

    expect(overview.externalGrafanaUrl).toBe('https://grafana.ritmo.app/d/overview');
    // Migration com rolled_back_at preenchido não marca banco como degraded
    expect(overview.database).toMatchObject({
      status: 'ok',
      tableCount: 2,
      migrationsApplied: 2,
      migrationsPendingOrFailed: 0,
    });
    expect(overview.cache.taxaAcerto).toBe(80);
    expect(overview.http.requests.total).toBe(1);

    expect(overview.academy.users).toEqual({
      total: 17,
      active: 14,
      inactive: 3,
      byRole: { ADMIN: 1, RECEPTION: 1, PERSONAL: 3, TRAINEE: 12 },
      activeByRole: { ADMIN: 1, RECEPTION: 1, PERSONAL: 2, TRAINEE: 10 },
    });
    expect(overview.academy.links).toEqual({
      active: 7,
      pending: 2,
      traineesWithoutTrainer: 3,
    });
    expect(overview.academy.sessions).toEqual({
      today: 5,
      last7Days: 28,
      last30Days: 110,
      completedLast30Days: 96,
    });

    expect(overview.security.last24h).toMatchObject({
      totalEvents: 28,
      loginSuccess: 18,
      loginFailure: 4,
      loginLocked: 1,
      authzDenied: 2,
      profileSwitched: 3,
    });
    expect(overview.security.loginDaily7d).toHaveLength(7);
    const todayBucket = overview.security.loginDaily7d[6];
    expect(todayBucket).toMatchObject({ success: 10, failure: 2, locked: 1 });
    expect(overview.security.topSuspiciousIps24h).toEqual([
      { ip: '198.51.100.42', count: 5 },
    ]);

    // Segunda chamada dentro da janela de 15s reaproveita cache global sem reconsultar o banco
    await useCase.execute(60);
    expect(cache.lembrarGlobal).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
  });

  it('marca banco como degraded quando há migration realmente pendente/falha sem rollback', async () => {
    const prisma = makePrismaMock({
      migs: [
        { finished_at: new Date(), rolled_back_at: null },
        { finished_at: null, rolled_back_at: null },
      ],
    });
    const cache = makeCacheMock();
    const useCase = new GetAdminOverviewUseCase(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
      new MetricsService(),
    );

    const overview = await useCase.execute();
    expect(overview.database.status).toBe('degraded');
    expect(overview.database.migrationsPendingOrFailed).toBe(1);
  });

  it('rejeita ADMIN_GRAFANA_URL com protocolo perigoso (ex.: javascript:)', async () => {
    process.env.ADMIN_GRAFANA_URL = 'javascript:alert(1)';
    const prisma = makePrismaMock();
    const cache = makeCacheMock();
    const useCase = new GetAdminOverviewUseCase(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
      new MetricsService(),
    );

    const overview = await useCase.execute();
    expect(overview.externalGrafanaUrl).toBeNull();
  });
});
