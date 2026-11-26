import { LoginThrottleService } from './login-throttle.service';

describe('LoginThrottleService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('bloqueia o IP na 5ª falha consecutiva e libera após reset', () => {
    const svc = new LoginThrottleService();
    const key = svc.key('203.0.113.10');

    for (let i = 1; i <= 4; i++) {
      expect(svc.recordFailure(key)).toEqual({ attempts: i, lockedNow: false });
      expect(svc.status(key).locked).toBe(false);
    }

    expect(svc.recordFailure(key)).toEqual({ attempts: 5, lockedNow: true, scope: 'ip' });
    expect(svc.status(key)).toMatchObject({ locked: true, scope: 'ip' });

    svc.reset(key);
    expect(svc.status(key).locked).toBe(false);
  });

  it('ativa o teto global na 30ª falha distribuída entre IPs distintos', () => {
    const svc = new LoginThrottleService();
    let lastResult: ReturnType<LoginThrottleService['recordFailure']> = {
      attempts: 0,
      lockedNow: false,
    };

    for (let i = 1; i <= 30; i++) {
      lastResult = svc.recordFailure(svc.key(`198.51.100.${i}`));
    }

    expect(lastResult).toEqual({ attempts: 30, lockedNow: true, scope: 'global' });
    expect(svc.status(svc.key('192.0.2.99'))).toMatchObject({
      locked: true,
      scope: 'global',
    });
  });

  it('remove buckets expirados automaticamente para evitar vazamento de memória', () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const svc = new LoginThrottleService();

    svc.recordFailure(svc.key('10.0.0.1'));
    svc.recordFailure(svc.key('10.0.0.2'));
    expect(svc.size()).toBe(3); // 2 IPs + 1 global

    // Avança além da janela (60s) e do intervalo de limpeza
    now += 120_000;
    svc.recordFailure(svc.key('10.0.0.3'));

    // 10.0.0.1 e 10.0.0.2 expiraram e foram podados; restam apenas 10.0.0.3 e global
    expect(svc.size()).toBe(2);
  });
});
