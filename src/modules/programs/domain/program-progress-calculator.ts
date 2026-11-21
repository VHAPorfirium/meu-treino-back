export interface CompletedSessionSummary {
  /** 'YYYY-MM-DD' no fuso do app. */
  dayKey: string;
}

export interface ProgramProgressInput {
  startDayKey: string;
  todayDayKey: string;
  totalDays: number;
  completedSessions: CompletedSessionSummary[];
}

export interface ProgramProgress {
  /** "Dia 19..." — nunca passa do total. */
  currentDayNumber: number;
  /** "...de 30". */
  totalDays: number;
  completedWorkoutsCount: number;
  trainedDaysCount: number;
  /** 0 a 100, pelo tempo decorrido da jornada. */
  progressPercentage: number;
  /** Chegou (ou passou) do último dia: o próximo treino concluído encerra a jornada. */
  isLastDayReached: boolean;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Dias inteiros entre duas chaves 'YYYY-MM-DD', sem passar por fuso nenhum. */
export function countDaysBetween(startDayKey: string, endDayKey: string): number {
  const toUtcTimestamp = (dayKey: string) => {
    const [year, month, day] = dayKey.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtcTimestamp(endDayKey) - toUtcTimestamp(startDayKey)) / MILLISECONDS_PER_DAY);
}

export function calculateProgramProgress(progressInput: ProgramProgressInput): ProgramProgress {
  const { startDayKey, todayDayKey, totalDays, completedSessions } = progressInput;

  const elapsedDayNumber = countDaysBetween(startDayKey, todayDayKey) + 1;
  const currentDayNumber = Math.min(Math.max(elapsedDayNumber, 1), totalDays);
  const trainedDaysCount = new Set(completedSessions.map((session) => session.dayKey)).size;

  return {
    currentDayNumber,
    totalDays,
    completedWorkoutsCount: completedSessions.length,
    trainedDaysCount,
    progressPercentage: Math.round((currentDayNumber / totalDays) * 100),
    isLastDayReached: elapsedDayNumber >= totalDays,
  };
}
