import { Injectable } from '@nestjs/common';
import { getAppTimezone } from '../time/dia-local';

export interface HttpMetricSample {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
}

export interface RouteMetricSummary {
  method: string;
  route: string;
  count: number;
  errorCount: number;
  errorRatePct: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface HourlyTrafficBucket {
  hour: string;
  total: number;
  errors4xx: number;
  errors5xx: number;
  p95Ms: number;
}

export interface HttpMetricsSnapshot {
  windowMinutes: number;
  uptimeSeconds: number;
  startedAt: string;
  nodeVersion: string;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
  };
  requests: {
    total: number;
    lifetimeTotal: number;
    perMinute: number;
    status2xx: number;
    status3xx: number;
    status4xx: number;
    status5xx: number;
    errorRatePct: number;
    clientErrorRatePct: number;
  };
  latencyMs: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  timeline: HourlyTrafficBucket[];
  topRoutes: RouteMetricSummary[];
  slowestRoutes: RouteMetricSummary[];
}

const MAX_SAMPLES = 5_000;
const DEFAULT_WINDOW_MINUTES = 24 * 60;
const HOUR_MS = 60 * 60 * 1000;

/** Sub-rotas estáticas conhecidas para evitar colapsá-las em `:id`. */
const STATIC_SEGMENTS: ReadonlySet<string> = new Set([
  'api',
  'auth',
  'login',
  'logout',
  'me',
  'change-password',
  'linked-profiles',
  'switch-profile',
  'users',
  'user',
  'suggest-username',
  'status',
  'reset-password',
  'links',
  'request',
  'sent',
  'pending',
  'current',
  'accept',
  'reject',
  'end',
  'exercises',
  'equipment',
  'favorites',
  'favorite',
  'alternatives',
  'muscle-groups',
  'workouts',
  'today',
  'mine',
  'session',
  'duplicate',
  'assignees',
  'batch',
  'reorder',
  'workout-logs',
  'history',
  'my-history',
  'last-performance',
  'exercise-stats',
  'attention',
  'progress-summary',
  'complete',
  'notes',
  'read',
  'progress-photos',
  'upload-url',
  'push',
  'public-key',
  'subscribe',
  'programs',
  'achievements',
  'assignments',
  'archive',
  'health',
  'db',
  'cache',
  'admin',
  'overview',
  'access-logs',
  'export',
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUID_RE = /^c[a-z0-9]{18,}$/i;
const HEX_ID_RE = /^[0-9a-f]{16,}$/i;
const NUMERIC_RE = /^\d+$/;
const PREFIXED_ID_RE = /^(u|w|p|ex|log|link)_[a-z0-9_-]{3,}$/i;

/**
 * Normaliza rotas HTTP para evitar explosão de cardinalidade no agregador
 * em memória (ex.: `/api/workouts/cm3abc.../session` → `/api/workouts/:id/session`).
 */
export function normalizeRoutePath(rawPath: string): string {
  const withoutQuery = (rawPath || '/').split('?')[0].trim();
  const collapsed = withoutQuery.replace(/\/{2,}/g, '/');
  const trimmed = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
  const parts = trimmed.split('/');

  const normalized = parts.map((segment, index) => {
    if (!segment) return '';
    if (segment.startsWith(':')) return segment;
    if (STATIC_SEGMENTS.has(segment.toLowerCase())) return segment.toLowerCase();
    if (
      UUID_RE.test(segment) ||
      CUID_RE.test(segment) ||
      HEX_ID_RE.test(segment) ||
      NUMERIC_RE.test(segment) ||
      PREFIXED_ID_RE.test(segment)
    ) {
      return ':id';
    }
    // Qualquer segmento logo após um recurso conhecido que não é sub-rota estática é ID
    const prev = parts[index - 1]?.toLowerCase() ?? '';
    if (
      [
        'users',
        'user',
        'workouts',
        'programs',
        'links',
        'notes',
        'progress-photos',
        'exercises',
        'workout-logs',
        'assignments',
        'exercise-stats',
      ].includes(prev)
    ) {
      return ':id';
    }
    return segment;
  });

  return normalized.join('/') || '/';
}

/** Percentil por método nearest-rank sobre array JÁ ordenado de forma crescente. */
export function computePercentile(
  sortedAsc: readonly number[],
  percentile: number,
): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((percentile / 100) * sortedAsc.length) - 1;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank));
  return Math.round(sortedAsc[idx] * 10) / 10;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function bytesToMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function formatHourLabel(epochMs: number): string {
  try {
    const fmt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: getAppTimezone(),
      hour: '2-digit',
      hour12: false,
    });
    const h = fmt.format(new Date(epochMs)).padStart(2, '0');
    return `${h}h`;
  } catch {
    const h = String(new Date(epochMs).getUTCHours()).padStart(2, '0');
    return `${h}h`;
  }
}

/**
 * Coletor leve de métricas HTTP em memória com janela deslizante (padrão 24h)
 * e limite rígido de amostras (ring buffer de 5.000 entradas).
 *
 * Sem custo de banco nem vazamento de memória: alimenta o painel `/admin`.
 */
@Injectable()
export class MetricsService {
  private readonly startedAtMs = Date.now();
  private samples: HttpMetricSample[] = [];
  private lifetimeTotal = 0;

  record(input: Omit<HttpMetricSample, 'timestamp'> & { timestamp?: number }): void {
    const now = input.timestamp ?? Date.now();
    const durationMs = Number.isFinite(input.durationMs)
      ? Math.max(0, round1(input.durationMs))
      : 0;

    this.lifetimeTotal += 1;
    this.samples.push({
      method: (input.method || 'GET').toUpperCase(),
      route: normalizeRoutePath(input.route),
      statusCode: input.statusCode,
      durationMs,
      timestamp: now,
    });

    if (this.samples.length > MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    }
  }

  /** Limpa o estado (usado em testes unitários). */
  reset(): void {
    this.samples = [];
    this.lifetimeTotal = 0;
  }

  getSnapshot(
    windowMinutes = DEFAULT_WINDOW_MINUTES,
    nowMs = Date.now(),
  ): HttpMetricsSnapshot {
    const clampedMinutes = Math.max(5, Math.min(DEFAULT_WINDOW_MINUTES, Math.trunc(windowMinutes)));
    const cutoff = nowMs - clampedMinutes * 60_000;

    // Poda preguiçosa de amostras além da janela máxima de 24h
    const maxCutoff = nowMs - DEFAULT_WINDOW_MINUTES * 60_000;
    if (this.samples.length > 0 && this.samples[0].timestamp < maxCutoff) {
      const firstValidIdx = this.samples.findIndex((s) => s.timestamp >= maxCutoff);
      if (firstValidIdx === -1) this.samples = [];
      else if (firstValidIdx > 0) this.samples.splice(0, firstValidIdx);
    }

    const active = this.samples.filter((s) => s.timestamp >= cutoff);

    let status2xx = 0;
    let status3xx = 0;
    let status4xx = 0;
    let status5xx = 0;
    let totalDuration = 0;
    let maxDuration = 0;
    const durations: number[] = [];

    const byRoute = new Map<
      string,
      { method: string; route: string; durations: number[]; errorCount: number }
    >();

    for (const s of active) {
      if (s.statusCode >= 500) status5xx += 1;
      else if (s.statusCode >= 400) status4xx += 1;
      else if (s.statusCode >= 300) status3xx += 1;
      else status2xx += 1;

      durations.push(s.durationMs);
      totalDuration += s.durationMs;
      if (s.durationMs > maxDuration) maxDuration = s.durationMs;

      const key = `${s.method} ${s.route}`;
      let entry = byRoute.get(key);
      if (!entry) {
        entry = { method: s.method, route: s.route, durations: [], errorCount: 0 };
        byRoute.set(key, entry);
      }
      entry.durations.push(s.durationMs);
      if (s.statusCode >= 400) entry.errorCount += 1;
    }

    durations.sort((a, b) => a - b);

    const total = active.length;
    const observedMinutes = Math.max(
      1,
      Math.min(clampedMinutes, (nowMs - this.startedAtMs) / 60_000),
    );

    const routeSummaries: RouteMetricSummary[] = [];
    for (const entry of byRoute.values()) {
      const sorted = [...entry.durations].sort((a, b) => a - b);
      const sum = sorted.reduce((acc, v) => acc + v, 0);
      routeSummaries.push({
        method: entry.method,
        route: entry.route,
        count: sorted.length,
        errorCount: entry.errorCount,
        errorRatePct: round1((entry.errorCount / sorted.length) * 100),
        avgMs: round1(sum / sorted.length),
        p50Ms: computePercentile(sorted, 50),
        p95Ms: computePercentile(sorted, 95),
        p99Ms: computePercentile(sorted, 99),
      });
    }

    const topRoutes = [...routeSummaries]
      .sort((a, b) => b.count - a.count || b.p95Ms - a.p95Ms)
      .slice(0, 10);

    const slowestRoutes = [...routeSummaries]
      .sort((a, b) => b.p95Ms - a.p95Ms || b.count - a.count)
      .slice(0, 8);

    // Timeline de 24 buckets horários (da hora mais antiga até a hora atual)
    const currentHourStart = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
    const bucketStarts: number[] = [];
    const bucketMap = new Map<
      number,
      { total: number; errors4xx: number; errors5xx: number; durations: number[] }
    >();

    for (let i = 23; i >= 0; i--) {
      const start = currentHourStart - i * HOUR_MS;
      bucketStarts.push(start);
      bucketMap.set(start, { total: 0, errors4xx: 0, errors5xx: 0, durations: [] });
    }

    for (const s of active) {
      const bStart = Math.floor(s.timestamp / HOUR_MS) * HOUR_MS;
      const bucket = bucketMap.get(bStart);
      if (!bucket) continue;
      bucket.total += 1;
      if (s.statusCode >= 500) bucket.errors5xx += 1;
      else if (s.statusCode >= 400) bucket.errors4xx += 1;
      bucket.durations.push(s.durationMs);
    }

    const timeline: HourlyTrafficBucket[] = bucketStarts.map((start) => {
      const b = bucketMap.get(start)!;
      b.durations.sort((a, c) => a - c);
      return {
        hour: formatHourLabel(start),
        total: b.total,
        errors4xx: b.errors4xx,
        errors5xx: b.errors5xx,
        p95Ms: computePercentile(b.durations, 95),
      };
    });

    const mem = process.memoryUsage();

    return {
      windowMinutes: clampedMinutes,
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: new Date(this.startedAtMs).toISOString(),
      nodeVersion: process.version,
      memory: {
        rssMb: bytesToMb(mem.rss),
        heapUsedMb: bytesToMb(mem.heapUsed),
        heapTotalMb: bytesToMb(mem.heapTotal),
        externalMb: bytesToMb(mem.external),
      },
      requests: {
        total,
        lifetimeTotal: this.lifetimeTotal,
        perMinute: round1(total / observedMinutes),
        status2xx,
        status3xx,
        status4xx,
        status5xx,
        errorRatePct: total > 0 ? round1((status5xx / total) * 100) : 0,
        clientErrorRatePct: total > 0 ? round1((status4xx / total) * 100) : 0,
      },
      latencyMs: {
        avg: total > 0 ? round1(totalDuration / total) : 0,
        p50: computePercentile(durations, 50),
        p95: computePercentile(durations, 95),
        p99: computePercentile(durations, 99),
        max: round1(maxDuration),
      },
      timeline,
      topRoutes,
      slowestRoutes,
    };
  }
}
