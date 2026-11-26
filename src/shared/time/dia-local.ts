/**
 * Dia local do app — não o dia UTC do servidor.
 *
 * Por que isso existe: a API roda no servidor em **UTC** e a aluna treina no
 * Brasil (UTC−3). Um treino às 22h39 de segunda é 01h39 de **terça** em UTC.
 * Qualquer regra de "hoje" baseada em `new Date().setHours(0,0,0,0)` do servidor
 * vira o dia às 21h locais — o bloqueio do E9 se abriria sozinho toda noite,
 * justamente no horário em que ela treina.
 *
 * `APP_TIMEZONE` permite mudar o fuso sem tocar no código (default: São Paulo).
 */
/** Lê APP_TIMEZONE dinamicamente (após ConfigModule carregar `.env`). */
export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE?.trim() || 'America/Sao_Paulo';
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = formatters.get(tz);
  if (!fmt) {
    // en-CA formata como YYYY-MM-DD, que é exatamente o que queremos
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(tz, fmt);
  }
  return fmt;
}

/** 'YYYY-MM-DD' do dia local. É a chave de negócio gravada em `WorkoutLog.dayKey`. */
export function diaLocal(d: Date = new Date(), tz: string = getAppTimezone()): string {
  return getFormatter(tz).format(d);
}

/** Dia da semana (0 = domingo) no fuso local. */
export function diaDaSemanaLocal(d: Date = new Date(), tz: string = getAppTimezone()): number {
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

/** Segunda-feira ('YYYY-MM-DD') da semana local à qual `chave` pertence. */
export function inicioDaSemanaLocal(chave: string): string {
  const [ano, mes, dia] = chave.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  const offsetSegunda = (d.getUTCDay() + 6) % 7; // segunda = 0 ... domingo = 6
  d.setUTCDate(d.getUTCDate() - offsetSegunda);
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
