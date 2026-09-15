import { diaDaSemanaLocal, diaLocal, proximaOcorrencia, somarDias } from './dia-local';

/**
 * O E9 depende inteiramente disto estar certo. O servidor roda em UTC e a aluna
 * treina no Brasil: um treino das 22h39 de segunda é 01h39 de TERÇA em UTC. Se
 * essas conversões escorregarem, o bloqueio "já treinou hoje" abre sozinho toda
 * noite por volta das 21h — justamente no horário em que ela treina.
 */
const TZ = 'America/Sao_Paulo';

describe('dia local vs. dia UTC do servidor', () => {
  it('a sessão real da Ninfa (22h39 BRT de seg) conta como SEGUNDA, não terça', () => {
    const instante = new Date('2026-09-15T01:39:00Z'); // 22h39 de 14/09 em BRT
    expect(diaLocal(instante, TZ)).toBe('2026-09-14');
    expect(diaDaSemanaLocal(instante, TZ)).toBe(1); // segunda
  });

  it('meia-noite e um minuto local já é o dia novo', () => {
    const instante = new Date('2026-09-15T03:01:00Z'); // 00h01 de 15/09 em BRT
    expect(diaLocal(instante, TZ)).toBe('2026-09-15');
  });

  it('23h59 UTC ainda é o MESMO dia local (20h59)', () => {
    const instante = new Date('2026-09-14T23:59:00Z');
    expect(diaLocal(instante, TZ)).toBe('2026-09-14');
  });
});

describe('próxima liberação do treino', () => {
  it('concluiu na segunda → libera só na segunda seguinte (nunca hoje)', () => {
    expect(proximaOcorrencia(1, '2026-09-14')).toBe('2026-09-21');
  });

  it('treino de quarta, concluído na segunda → libera na quarta', () => {
    expect(proximaOcorrencia(3, '2026-09-14')).toBe('2026-09-16');
  });

  it('treino de domingo, concluído na segunda → libera no domingo seguinte', () => {
    expect(proximaOcorrencia(0, '2026-09-14')).toBe('2026-09-20');
  });

  it('treino sem dia fixo → libera amanhã', () => {
    expect(proximaOcorrencia(null, '2026-09-14')).toBe('2026-09-15');
  });

  it('atravessa a virada do mês', () => {
    expect(somarDias('2026-09-30', 1)).toBe('2026-10-01');
    expect(proximaOcorrencia(4, '2026-09-30')).toBe('2026-10-01'); // quarta -> quinta
  });

  it('atravessa a virada do ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
  });
});
