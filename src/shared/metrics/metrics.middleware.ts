import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

/** Ignora apenas pings de liveness para não distorcer métricas de tráfego real. */
const IGNORE_LIVENESS_RE = /^\/api\/health\/?$/;

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startNs = process.hrtime.bigint();

    res.on('finish', () => {
      const rawPath = (req.originalUrl ?? req.url ?? '/').split('?')[0];
      if (IGNORE_LIVENESS_RE.test(rawPath)) return;

      const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      const matchedRoute =
        typeof req.route?.path === 'string'
          ? `${req.baseUrl ?? ''}${req.route.path}`
          : rawPath;

      this.metrics.record({
        method: req.method,
        route: matchedRoute,
        statusCode: res.statusCode,
        durationMs,
      });
    });

    next();
  }
}
