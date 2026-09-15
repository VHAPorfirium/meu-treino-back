/**
 * Dia local do app — não o dia UTC do servidor.
 *
 * Por que isso existe: a API roda no Render em **UTC** e a aluna treina no
 * Brasil (UTC−3). Um treino às 22h39 de segunda é 01h39 de **terça** em UTC.
 * Qualquer regra de "hoje" baseada em `new Date().setHours(0,0,0,0)` do servidor
 * vira o dia às 21h locais — o bloqueio do E9 se abriria sozinho toda noite,
 * justamente no horário em que ela treina.
 *
 * `APP_TIMEZONE` permite mudar o fuso sem tocar no código (default: São Paulo).
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'America/Sao_Paulo';

/** 'YYYY-MM-DD' do dia local. É a chave de negócio gravada em `WorkoutLog.dayKey`. */
export function diaLocal(d: Date = new Date(), tz: string = APP_TIMEZONE): string {
  // en-CA formata como YYYY-MM-DD, que é exatamente o que queremos
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Dia da semana (0 = domingo) no fuso local. */
export function diaDaSemanaLocal(d: Date = new Date(), tz: string = APP_TIMEZONE): number {
  const [ano, mes, dia] = diaLocal(d, tz).split('-').map(Number);
  // Date.UTC + getUTCDay evita que o fuso do processo mexa no resultado
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** Soma dias a uma chave 'YYYY-MM-DD' (sem passar por fuso nenhum). */
export function somarDias(chave: string, dias: number): string {
  const [ano, mes, dia] = chave.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Próxima data (exclusiva: nunca hoje) em que cai `dayOfWeek`.
 * `dayOfWeek` nulo = treino sem dia fixo → libera amanhã.
 */
export function proximaOcorrencia(
  dayOfWeek: number | null | undefined,
  hoje: string = diaLocal(),
): string {
  if (dayOfWeek == null) return somarDias(hoje, 1);
  const [ano, mes, dia] = hoje.split('-').map(Number);
  const atual = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  const delta = (dayOfWeek - atual + 7) % 7;
  return somarDias(hoje, delta === 0 ? 7 : delta);
}
