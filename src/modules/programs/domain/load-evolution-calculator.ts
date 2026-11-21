export interface ExerciseLoadRecord {
  /** Identifica o exercício executado (o substituto, quando houve troca). */
  exerciseId: string;
  load: number;
}

export interface SessionLoadRecords {
  /** Sessões devem vir em ordem cronológica. */
  exerciseLoads: ExerciseLoadRecord[];
}

/**
 * Evolução média de carga (%) na jornada: para cada exercício compara a
 * primeira carga registrada com a última e tira a média entre os exercícios.
 * Exercícios com um único registro, ou sem carga, ficam de fora.
 * Devolve `null` quando não há base de comparação.
 */
export function calculateLoadEvolutionPercentage(
  sessionsInChronologicalOrder: SessionLoadRecords[],
): number | null {
  const firstLoadByExerciseId = new Map<string, number>();
  const lastLoadByExerciseId = new Map<string, number>();
  const recordCountByExerciseId = new Map<string, number>();

  for (const session of sessionsInChronologicalOrder) {
    for (const { exerciseId, load } of session.exerciseLoads) {
      if (!(load > 0)) continue;
      if (!firstLoadByExerciseId.has(exerciseId)) firstLoadByExerciseId.set(exerciseId, load);
      lastLoadByExerciseId.set(exerciseId, load);
      recordCountByExerciseId.set(exerciseId, (recordCountByExerciseId.get(exerciseId) ?? 0) + 1);
    }
  }

  const evolutionPercentages: number[] = [];
  for (const [exerciseId, firstLoad] of firstLoadByExerciseId) {
    if ((recordCountByExerciseId.get(exerciseId) ?? 0) < 2) continue;
    const lastLoad = lastLoadByExerciseId.get(exerciseId)!;
    evolutionPercentages.push(((lastLoad - firstLoad) / firstLoad) * 100);
  }

  if (evolutionPercentages.length === 0) return null;
  const averageEvolution =
    evolutionPercentages.reduce((sum, percentage) => sum + percentage, 0) / evolutionPercentages.length;
  return Math.round(averageEvolution);
}
