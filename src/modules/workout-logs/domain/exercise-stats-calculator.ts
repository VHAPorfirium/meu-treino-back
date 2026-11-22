export interface ExercisePerformanceRecord {
  performedAt: Date;
  /** Maior carga da sessão (kg), quando houve carga. */
  heaviestWeight: number | null;
}

export interface ExerciseStats {
  timesPerformed: number;
  bestWeight: number | null;
  /** Evolução (%) entre a primeira e a última carga dos últimos 30 dias. */
  evolutionLast30DaysPercentage: number | null;
  lastPerformedAt: string | null;
}

const THIRTY_DAYS_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

/** Números de um exercício para o aluno — os registros devem vir em ordem cronológica. */
export function calculateExerciseStats(
  performancesInChronologicalOrder: ExercisePerformanceRecord[],
  now: Date = new Date(),
): ExerciseStats {
  const weights = performancesInChronologicalOrder
    .map((performance) => performance.heaviestWeight)
    .filter((weight): weight is number => weight !== null && weight > 0);

  const recentWeights = performancesInChronologicalOrder
    .filter((performance) => now.getTime() - performance.performedAt.getTime() <= THIRTY_DAYS_IN_MILLISECONDS)
    .map((performance) => performance.heaviestWeight)
    .filter((weight): weight is number => weight !== null && weight > 0);

  const evolutionLast30DaysPercentage =
    recentWeights.length >= 2
      ? Math.round(((recentWeights[recentWeights.length - 1] - recentWeights[0]) / recentWeights[0]) * 100)
      : null;

  const lastPerformance = performancesInChronologicalOrder[performancesInChronologicalOrder.length - 1];
  return {
    timesPerformed: performancesInChronologicalOrder.length,
    bestWeight: weights.length ? Math.max(...weights) : null,
    evolutionLast30DaysPercentage,
    lastPerformedAt: lastPerformance ? lastPerformance.performedAt.toISOString() : null,
  };
}
