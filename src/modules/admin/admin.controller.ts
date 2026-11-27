import { Controller, Get, Query, Res } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../../shared/auth/roles.decorator';
import { AccessLogService } from '../../shared/security/access-log.service';
import { diaLocal } from '../../shared/time/dia-local';
import { ListAccessLogsQueryDto } from './application/dto/list-access-logs-query.dto';
import { formatAccessLogsCsv } from './application/csv-export';
import { GetAdminOverviewUseCase } from './application/get-admin-overview.use-case';

const MAX_CSV_EXPORT_ROWS = 5_000;

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly getOverview: GetAdminOverviewUseCase,
    private readonly accessLogs: AccessLogService,
  ) {}

  /** GET /api/admin/overview — saúde, performance HTTP, contadores e segurança. */
  @Get('overview')
  overview(@Query('windowMinutes') rawWindow?: string) {
    const parsed = rawWindow ? Number.parseInt(rawWindow, 10) : 1440;
    const windowMinutes = Number.isFinite(parsed) ? parsed : 1440;
    return this.getOverview.execute(windowMinutes);
  }

  /** GET /api/admin/access-logs — auditoria paginada com header X-Total-Count. */
  @Get('access-logs')
  async listAccessLogs(
    @Query() query: ListAccessLogsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const page = await this.accessLogs.listDetailed({
      event: query.event,
      userId: query.userId,
      actorUserId: query.actorUserId,
      ip: query.ip,
      search: query.search,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
    res.setHeader('X-Total-Count', String(page.total));
    return page;
  }

  /** GET /api/admin/access-logs/export — exportação CSV segura com filtros aplicados. */
  @Get('access-logs/export')
  async exportAccessLogs(
    @Query() query: ListAccessLogsQueryDto,
    @Res() res: Response,
  ) {
    const page = await this.accessLogs.listDetailed(
      {
        event: query.event,
        userId: query.userId,
        actorUserId: query.actorUserId,
        ip: query.ip,
        search: query.search,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: MAX_CSV_EXPORT_ROWS,
        offset: 0,
      },
      MAX_CSV_EXPORT_ROWS,
    );

    const filename = `ritmo-access-logs-${diaLocal()}.csv`;
    const csv = formatAccessLogsCsv(page.items);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(csv);
  }
}
