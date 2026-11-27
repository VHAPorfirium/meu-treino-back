import { Role } from '@prisma/client';
import type { Response } from 'express';
import { ROLES_KEY } from '../../shared/auth/roles.decorator';
import {
  AccessLogDetailed,
  AccessLogService,
} from '../../shared/security/access-log.service';
import { escapeCsvCell, formatAccessLogsCsv } from './application/csv-export';
import { GetAdminOverviewUseCase } from './application/get-admin-overview.use-case';
import { AdminController } from './admin.controller';

describe('AdminController', () => {
  it('restringe todo o controller exclusivamente ao papel ADMIN', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AdminController) as Role[];
    expect(roles).toEqual([Role.ADMIN]);
  });

  it('listAccessLogs retorna página detalhada e define header X-Total-Count', async () => {
    const page = {
      items: [{ id: 'log-1', event: 'auth.login.success' }],
      total: 42,
      limit: 25,
      offset: 0,
    };
    const accessLogs = {
      listDetailed: jest.fn().mockResolvedValue(page),
    } as unknown as AccessLogService;
    const overview = {
      execute: jest.fn(),
    } as unknown as GetAdminOverviewUseCase;

    const controller = new AdminController(overview, accessLogs);
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;

    const result = await controller.listAccessLogs(
      {
        event: 'auth.login.success',
        search: 'victor',
        limit: 25,
        offset: 0,
      },
      res,
    );

    expect(result).toEqual(page);
    expect(setHeader).toHaveBeenCalledWith('X-Total-Count', '42');
    expect(accessLogs.listDetailed).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.login.success',
        search: 'victor',
        limit: 25,
        offset: 0,
      }),
    );
  });

  it('exportAccessLogs gera CSV UTF-8 seguro e neutraliza CSV Formula Injection', async () => {
    const sample: AccessLogDetailed = {
      id: 'log-2',
      event: 'auth.login.failure',
      userId: 'u1',
      actorUserId: null,
      identifierMasked: '=cmd|"/C calc"!A0',
      ip: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
      method: 'POST',
      path: '/api/auth/login',
      statusCode: 401,
      reason: 'invalid_credentials, "bad"',
      requestId: 'req-99',
      durationMs: 14,
      createdAt: new Date('2026-11-27T10:00:00.000Z'),
      user: { id: 'u1', name: '+Evil Name', username: 'evil.user', role: 'TRAINEE' },
      actor: null,
    };

    const accessLogs = {
      listDetailedForExport: jest.fn().mockResolvedValue([sample]),
    } as unknown as AccessLogService;
    const overview = {
      execute: jest.fn(),
    } as unknown as GetAdminOverviewUseCase;

    const controller = new AdminController(overview, accessLogs);
    const setHeader = jest.fn();
    const send = jest.fn();
    const res = { setHeader, send } as unknown as Response;

    await controller.exportAccessLogs({ to: '2026-11-27' }, res);

    expect(accessLogs.listDetailedForExport).toHaveBeenCalledWith(
      expect.objectContaining({
        to: new Date('2026-11-27T23:59:59.999Z'),
        limit: 5000,
        offset: 0,
      }),
      5000,
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );

    const csv = send.mock.calls[0][0] as string;
    expect(csv.startsWith('\uFEFFdata_hora_utc,evento,')).toBe(true);
    // Neutralizou fórmula iniciada com '=' e '+'
    expect(csv).toContain('"\'=cmd|""/C calc""!A0"');
    expect(csv).toContain("'+Evil Name (evil.user)");
    // Escapou vírgula e aspas duplas RFC-4180
    expect(csv).toContain('"invalid_credentials, ""bad"""');
  });

  it('rejeita parâmetro de data inválido com BadRequestException', async () => {
    const accessLogs = {
      listDetailed: jest.fn(),
    } as unknown as AccessLogService;
    const overview = {
      execute: jest.fn(),
    } as unknown as GetAdminOverviewUseCase;

    const controller = new AdminController(overview, accessLogs);
    const res = { setHeader: jest.fn() } as unknown as Response;

    await expect(
      controller.listAccessLogs({ from: 'data-invalida' }, res),
    ).rejects.toThrow('Parâmetro de data inválido');
    expect(accessLogs.listDetailed).not.toHaveBeenCalled();
  });

  it('escapeCsvCell e formatAccessLogsCsv protegem todos os prefixos de fórmula (inclusive com espaços)', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('  =1+1')).toBe("'  =1+1");
    expect(escapeCsvCell('+SUM(A1)')).toBe("'+SUM(A1)");
    expect(escapeCsvCell('-2+3')).toBe("'-2+3");
    expect(escapeCsvCell('@admin')).toBe("'@admin");
    expect(formatAccessLogsCsv([])).toContain('data_hora_utc,evento');
  });
});
