import { LinkStatus, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CacheService } from '../../../shared/cache/cache.service';
import { MetricsService } from '../../../shared/metrics/metrics.service';
import { GetAdminOverviewUseCase } from './get-admin-overview.use-case';

function makePrismaMock() {
  return {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ table_name: 'User' }, { table_name: 'AccessLog' }])
      .mockResolvedValueOnce([
        { finished_at: new Date(), rolled_back_at: null },
        { finished_at: new Date(), rolled_back_at: null },
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
    workoutLog: {
      count: jest
        .fn()
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(28)
        .mockResolvedValueOnce(110)
        .mockResolvedValueOnce(96),
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
      findMany: jest.fn().mockResolvedValue([
        { event: 'auth.login.success', createdAt: new Date() },
        { event: 'auth.login.failure', createdAt: new Date() },
      ]),
    },
  };
}

describe('GetAdminOverviewUseCase', () => {
  const prevGrafana = process.env.ADMIN_GRAFANA_URL;

  afterEach(() => {
    if (prevGrafana === undefined) delete process.env.ADMIN_GRAFANA_URL;
    else process.env.ADMIN_GRAFANA_URL = prevGrafana;
  });

  it('consolida saúde, cache, métricas HTTP, contadores da academia e segurança', async () => {
    process.env.ADMIN_GRAFANA_URL = 'https://grafana.ritmo.app/d/overview';

    const prisma = makePrismaMock();
    const cache = {
      estatisticas: jest.fn().mockResolvedValue({
        enabled: true,
        entradas: 12,
        hits: 80,
        misses: 20,
        taxaAcerto: 80,
        emVoo: 0,
      }),
    } as unknown as CacheService;
    const metrics = new MetricsService();
    metrics.record({
      method: 'GET',
      route: '/api/workouts/mine',
      statusCode: 200,
      durationMs: 32,
    });

    const useCase = new GetAdminOverviewUseCase(
      prisma as unknown as PrismaService,
      cache,
      metrics,
    );

    const overview = await useCase.execute(1440);

    expect(overview.externalGrafanaUrl).toBe('https://grafana.ritmo.app/d/overview');
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
    expect(overview.security.topSuspiciousIps24h).toEqual([
      { ip: '198.51.100.42', count: 5 },
    ]);
  });

  it('rejeita ADMIN_GRAFANA_URL com protocolo perigoso (ex.: javascript:)', async () => {
    process.env.ADMIN_GRAFANA_URL = 'javascript:alert(1)';
    const prisma = makePrismaMock();
    const cache = {
      estatisticas: jest.fn().mockResolvedValue({
        enabled: true,
        entradas: 0,
        hits: 0,
        misses: 0,
        taxaAcerto: 0,
        emVoo: 0,
      }),
    } as unknown as CacheService;
    const useCase = new GetAdminOverviewUseCase(
      prisma as unknown as PrismaService,
      cache,
      new MetricsService(),
    );

    const overview = await useCase.execute();
    expect(overview.externalGrafanaUrl).toBeNull();
  });
});
