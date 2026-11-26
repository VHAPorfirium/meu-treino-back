import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { SecurityLogger } from '../security/security-logger';
import { AllExceptionsFilter } from './all-exceptions.filter';

function createHost(headersSent = false) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { headersSent, status };
  const req = { method: 'POST', originalUrl: '/api/users', id: 'req-123', ip: '127.0.0.1' };
  const host = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  return { host, res, status, json };
}

describe('AllExceptionsFilter', () => {
  const security = { event: jest.fn() } as unknown as SecurityLogger;

  it.each([
    ['P2002', HttpStatus.CONFLICT, 'Registro já existe'],
    ['P2003', HttpStatus.BAD_REQUEST, 'Referência inválida'],
    ['P2025', HttpStatus.NOT_FOUND, 'Registro não encontrado'],
  ])('traduz erro Prisma %s em HTTP %i', (code, expectedStatus, expectedMessage) => {
    const filter = new AllExceptionsFilter(security);
    const { host, status, json } = createHost();

    filter.catch({ code, message: 'prisma error' }, host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith({
      statusCode: expectedStatus,
      message: expectedMessage,
      requestId: 'req-123',
    });
  });

  it('não tenta escrever resposta se res.headersSent for true', () => {
    const filter = new AllExceptionsFilter(security);
    const { host, status } = createHost(true);

    filter.catch(new BadRequestException('erro'), host);

    expect(status).not.toHaveBeenCalled();
  });
});
