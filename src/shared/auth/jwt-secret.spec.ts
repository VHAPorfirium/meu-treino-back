import { getJwtSecret } from './jwt-secret';

describe('getJwtSecret', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('deve permitir fallback em ambiente de desenvolvimento', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    expect(getJwtSecret()).toBe('dev-secret-troque-em-producao');
  });

  it('deve lançar erro fatal em produção se JWT_SECRET não estiver definido', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    expect(() => getJwtSecret()).toThrow('FATAL DE SEGURANÇA');
  });

  it('deve lançar erro fatal em produção se JWT_SECRET for o valor padrão de dev', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev-secret-troque-em-producao';
    expect(() => getJwtSecret()).toThrow('FATAL DE SEGURANÇA');
  });

  it('deve lançar erro fatal em produção se JWT_SECRET tiver menos de 32 caracteres', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'curto-demais';
    expect(() => getJwtSecret()).toThrow('no mínimo 32 caracteres');
  });

  it('deve aceitar JWT_SECRET forte em produção', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(64);
    expect(getJwtSecret()).toBe('a'.repeat(64));
  });
});
