import {
  computePercentile,
  MetricsService,
  normalizeRoutePath,
} from './metrics.service';

describe('MetricsService', () => {
  it('normaliza IDs (CUID, UUID, numérico e prefixado) preservando sub-rotas estáticas', () => {
    expect(
      normalizeRoutePath('/api/workouts/cm4abc1234567890abcdef123/session'),
    ).toBe('/api/workouts/:id/session');
    expect(
      normalizeRoutePath('/api/users/u_victor_personal_v2/reset-password'),
    ).toBe('/api/users/:id/reset-password');
    expect(
      normalizeRoutePath(
        '/api/links/550e8400-e29b-41d4-a716-446655440000/accept?foo=1',
      ),
    ).toBe('/api/links/:id/accept');
    expect(normalizeRoutePath('/api/exercises/0042/alternatives')).toBe(
      '/api/exercises/:id/alternatives',
    );
    expect(normalizeRoutePath('/api/workout-logs/progress-summary')).toBe(
      '/api/workout-logs/progress-summary',
    );
    expect(normalizeRoutePath('/api/admin/access-logs/export')).toBe(
      '/api/admin/access-logs/export',
    );
  });

  it('calcula percentis p50, p95 e p99 corretamente', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(computePercentile(values, 50)).toBe(50);
    expect(computePercentile(values, 95)).toBe(95);
    expect(computePercentile(values, 99)).toBe(99);
    expect(computePercentile([], 95)).toBe(0);
  });

  it('agrega status, taxa de erro, percentis, topRoutes, slowestRoutes e timeline', () => {
    const service = new MetricsService();
    const now = Date.parse('2026-11-27T15:30:00.000Z');

    service.record({
      method: 'GET',
      route: '/api/workouts/mine',
      statusCode: 200,
      durationMs: 20,
      timestamp: now - 10_000,
    });
    service.record({
      method: 'GET',
      route: '/api/workouts/mine',
      statusCode: 200,
      durationMs: 40,
      timestamp: now - 8_000,
    });
    service.record({
      method: 'POST',
      route: '/api/auth/login',
      statusCode: 401,
      durationMs: 180,
      timestamp: now - 5_000,
    });
    service.record({
      method: 'PATCH',
      route: '/api/workout-logs/cm123456789012345678901/complete',
      statusCode: 500,
      durationMs: 650,
      timestamp: now - 2_000,
    });
    // Amostra antiga fora da janela de 24h -> deve ser descartada
    service.record({
      method: 'GET',
      route: '/api/exercises',
      statusCode: 200,
      durationMs: 9999,
      timestamp: now - 25 * 60 * 60 * 1000,
    });

    const snap = service.getSnapshot(1440, now);

    expect(snap.requests.total).toBe(4);
    expect(snap.requests.lifetimeTotal).toBe(5);
    expect(snap.requests.status2xx).toBe(2);
    expect(snap.requests.status4xx).toBe(1);
    expect(snap.requests.status5xx).toBe(1);
    expect(snap.requests.errorRatePct).toBe(25);
    expect(snap.requests.clientErrorRatePct).toBe(25);

    expect(snap.latencyMs.p50).toBe(40);
    expect(snap.latencyMs.p95).toBe(650);
    expect(snap.latencyMs.max).toBe(650);

    expect(snap.topRoutes[0]).toMatchObject({
      method: 'GET',
      route: '/api/workouts/mine',
      count: 2,
      errorCount: 0,
    });
    expect(snap.slowestRoutes[0]).toMatchObject({
      method: 'PATCH',
      route: '/api/workout-logs/:id/complete',
      p95Ms: 650,
      errorCount: 1,
    });

    expect(snap.timeline).toHaveLength(24);
    const lastBucket = snap.timeline[snap.timeline.length - 1];
    expect(lastBucket.total).toBe(4);
    expect(lastBucket.errors4xx).toBe(1);
    expect(lastBucket.errors5xx).toBe(1);
  });

  it('retorna snapshot limpo e seguro quando não há requisições registradas', () => {
    const service = new MetricsService();
    const snap = service.getSnapshot();
    expect(snap.requests.total).toBe(0);
    expect(snap.requests.errorRatePct).toBe(0);
    expect(snap.latencyMs.p95).toBe(0);
    expect(snap.topRoutes).toEqual([]);
    expect(snap.timeline).toHaveLength(24);
  });

  it('adapta granularidade da timeline conforme windowMinutes (1h, 6h, 24h)', () => {
    const service = new MetricsService();
    const now = Date.parse('2026-11-27T15:32:00.000Z');
    service.record({
      method: 'GET',
      route: '/api/health',
      statusCode: 200,
      durationMs: 12,
      timestamp: now - 30_000,
    });

    const snap1h = service.getSnapshot(60, now);
    expect(snap1h.timeline).toHaveLength(12);
    expect(snap1h.timeline[0].hour).toMatch(/^\d{2}:\d{2}$/);
    expect(snap1h.timeline[snap1h.timeline.length - 1].total).toBe(1);

    const snap6h = service.getSnapshot(360, now);
    expect(snap6h.timeline).toHaveLength(12);
    expect(snap6h.timeline[0].hour).toMatch(/^\d{2}:\d{2}$/);

    const snap24h = service.getSnapshot(1440, now);
    expect(snap24h.timeline).toHaveLength(24);
    expect(snap24h.timeline[0].hour).toMatch(/^\d{2}h$/);
  });
});
