import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../../shared/auth/roles.decorator';
import { AccessLogService } from '../../shared/security/access-log.service';
import { diaLocal } from '../../shared/time/dia-local';
import { ListAccessLogsQueryDto } from './application/dto/list-access-logs-query.dto';
import { formatAccessLogsCsv } from './application/csv-export';
import { GetAdminOverviewUseCase } from './application/get-admin-overview.use-case';

const MAX_CSV_EXPORT_ROWS = 5_000;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(
  raw: string | undefined,
  endOfDay = false,
): Date | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const iso =
    DATE_ONLY_RE.test(trimmed) && endOfDay
      ? `${trimmed}T23:59:59.999Z`
      : trimmed;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Parâmetro de data inválido');
  }
  return parsed;
}

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
      from: parseDateParam(query.from, false),
      to: parseDateParam(query.to, true),
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
    const filter = {
      event: query.event,
      userId: query.userId,
      actorUserId: query.actorUserId,
      ip: query.ip,
      search: query.search,
      from: parseDateParam(query.from, false),
      to: parseDateParam(query.to, true),
      limit: MAX_CSV_EXPORT_ROWS,
      offset: 0,
    };
    const items =
      typeof this.accessLogs.listDetailedForExport === 'function'
        ? await this.accessLogs.listDetailedForExport(filter, MAX_CSV_EXPORT_ROWS)
        : (await this.accessLogs.listDetailed(filter, MAX_CSV_EXPORT_ROWS)).items;

    const filename = `ritmo-access-logs-${diaLocal()}.csv`;
    const csv = formatAccessLogsCsv(items);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(csv);
  }
}
