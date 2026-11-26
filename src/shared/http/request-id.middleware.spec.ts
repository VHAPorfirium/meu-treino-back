import type { NextFunction, Request, Response } from 'express';
import { requestIdMiddleware } from './request-id.middleware';

describe('requestIdMiddleware', () => {
  function run(incoming?: string) {
    const req = { headers: incoming !== undefined ? { 'x-request-id': incoming } : {} } as unknown as Request & {
      id?: string;
    };
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    const next = jest.fn() as NextFunction;
    requestIdMiddleware(req, res, next);
    return { req, setHeader, next };
  }

  it('reaproveita x-request-id válido do proxy', () => {
    const { req, setHeader, next } = run('req_abc-123.456');
    expect(req.id).toBe('req_abc-123.456');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'req_abc-123.456');
    expect(next).toHaveBeenCalled();
  });

  it('gera UUID novo quando o header tem caracteres inválidos ou excede 128 chars', () => {
    const injected = run('ok\r\nX-Evil: 1');
    expect(injected.req.id).not.toContain('\n');
    expect(injected.req.id).toMatch(/^[0-9a-f-]{36}$/i);

    const spaces = run('id with spaces');
    expect(spaces.req.id).toMatch(/^[0-9a-f-]{36}$/i);

    const tooLong = run('a'.repeat(129));
    expect(tooLong.req.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
