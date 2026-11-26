import { PrismaService } from '../prisma/prisma.service';
import { AccessLogService } from './access-log.service';
import { SecurityLogger } from './security-logger';

function makePrismaMock() {
  return {
    accessLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

describe('AccessLogService', () => {
  it('persiste evento normalizado e trunca campos longos', async () => {
    const prisma = makePrismaMock();
    const service = new AccessLogService(prisma as unknown as PrismaService);

    await service.write({
      event: 'auth.login.failure',
      identifierMasked: '***.456.789-**',
      ip: '10.0.0.1',
      userAgent: 'A'.repeat(400),
      method: 'POST',
      path: '/api/auth/login',
      statusCode: 401,
      reason: 'invalid_credentials',
      requestId: 'req-1',
      durationMs: 42.7,
    });

    expect(prisma.accessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: 'auth.login.failure',
        userId: null,
        actorUserId: null,
        identifierMasked: '***.456.789-**',
        ip: '10.0.0.1',
        userAgent: 'A'.repeat(256),
        method: 'POST',
        path: '/api/auth/login',
        statusCode: 401,
        reason: 'invalid_credentials',
        requestId: 'req-1',
        durationMs: 43,
      }),
    });
  });

  it('nunca propaga erro do banco ao gravar (gravação resiliente)', async () => {
    const prisma = makePrismaMock();
    prisma.accessLog.create.mockRejectedValueOnce(new Error('DB indisponível'));
    const service = new AccessLogService(prisma as unknown as PrismaService);

    await expect(
      service.write({ event: 'auth.login.success', ip: '127.0.0.1', userId: 'u1' }),
    ).resolves.toBeUndefined();
  });

  it('dispara poda de retenção 90d apenas uma vez na janela de 24h', async () => {
    const prisma = makePrismaMock();
    const service = new AccessLogService(prisma as unknown as PrismaService);

    await service.write({ event: 'auth.login.success', ip: '127.0.0.1' });
    await service.write({ event: 'auth.login.success', ip: '127.0.0.1' });

    // Aguarda microtasks da poda em background
    await Promise.resolve();

    expect(prisma.accessLog.deleteMany).toHaveBeenCalledTimes(1);
    const where = prisma.accessLog.deleteMany.mock.calls[0][0].where;
    expect(where.createdAt.lt).toBeInstanceOf(Date);
  });

  it('aplica filtros e limita paginação em list()', async () => {
    const prisma = makePrismaMock();
    prisma.accessLog.findMany.mockResolvedValueOnce([{ id: 'l1' }]);
    prisma.accessLog.count.mockResolvedValueOnce(1);
    const service = new AccessLogService(prisma as unknown as PrismaService);

    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-02-01T00:00:00Z');
    const res = await service.list({
      event: 'auth.login.failure',
      userId: 'u1',
      ip: '1.2.3.4',
      from,
      to,
      limit: 999,
      offset: -10,
    });

    expect(res).toEqual({ items: [{ id: 'l1' }], total: 1, limit: 200, offset: 0 });
    expect(prisma.accessLog.findMany).toHaveBeenCalledWith({
      where: {
        event: 'auth.login.failure',
        userId: 'u1',
        ip: '1.2.3.4',
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      skip: 0,
    });
  });
});

describe('SecurityLogger + AccessLogService', () => {
  it('encaminha eventos de segurança para o AccessLogService quando injetado', () => {
    const record = jest.fn();
    const logger = new SecurityLogger({ record } as unknown as AccessLogService);

    logger.event('auth.account.deactivated', {
      ip: '10.0.0.5',
      userId: 'target-1',
      actorUserId: 'admin-1',
      method: 'PATCH',
      path: '/api/users/target-1/status',
      statusCode: 200,
      reason: 'deactivated_by_admin',
    });

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.account.deactivated',
        ip: '10.0.0.5',
        userId: 'target-1',
        actorUserId: 'admin-1',
        statusCode: 200,
        reason: 'deactivated_by_admin',
      }),
    );
  });

  it('funciona normalmente sem AccessLogService (compatibilidade com testes unitários)', () => {
    const logger = new SecurityLogger();
    expect(() =>
      logger.event('auth.login.success', { ip: '127.0.0.1', userId: 'u1' }),
    ).not.toThrow();
  });
});
