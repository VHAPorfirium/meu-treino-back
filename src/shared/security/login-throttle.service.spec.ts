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

  it('bloqueia a 6ª tentativa concorrente do mesmo IP antes do término das 5 em andamento (TOCTOU)', () => {
    const svc = new LoginThrottleService();
    const key = svc.key('203.0.113.55');

    for (let i = 0; i < 5; i++) {
      expect(svc.acquireAttempt(key).locked).toBe(false);
    }

    const sixth = svc.acquireAttempt(key);
    expect(sixth).toMatchObject({ locked: true, scope: 'ip', attempts: 5 });

    // Se uma falhar inesperadamente (ex.: erro de banco), libera vaga sem contar falha
    svc.releaseAttempt(key);
    expect(svc.acquireAttempt(key).locked).toBe(false);
  });

  it('bloqueia a 31ª tentativa concorrente distribuída pelo teto global antes de concluir argon2', () => {
    const svc = new LoginThrottleService();

    for (let i = 1; i <= 30; i++) {
      expect(svc.acquireAttempt(svc.key(`198.51.100.${i}`)).locked).toBe(false);
    }

    const overflow = svc.acquireAttempt(svc.key('192.0.2.77'));
    expect(overflow).toMatchObject({ locked: true, scope: 'global', attempts: 30 });
  });

  it('mantém contagem inFlight consistente quando uma tentativa tem sucesso enquanto outra ainda roda', () => {
    const svc = new LoginThrottleService();
    const key = svc.key('203.0.113.88');

    expect(svc.acquireAttempt(key).locked).toBe(false);
    expect(svc.acquireAttempt(key).locked).toBe(false);

    svc.completeSuccess(key);
    // A 2ª tentativa ainda está em voo, então falhar agora contabiliza apenas 1 falha
    expect(svc.completeFailure(key)).toEqual({ attempts: 1, lockedNow: false });
    expect(svc.status(key)).toMatchObject({ locked: false, attempts: 1 });
  });

  it('isola buckets distintos para identificadores diferentes no mesmo IP', () => {
    const svc = new LoginThrottleService();
    const keyA = svc.key('198.51.100.10', 'cpf-hash-a');
    const keyB = svc.key('198.51.100.10', 'cpf-hash-b');

    for (let i = 0; i < 5; i++) {
      svc.recordFailure(keyA);
    }

    expect(svc.status(keyA).locked).toBe(true);
    expect(svc.status(keyB).locked).toBe(false);
  });
});
