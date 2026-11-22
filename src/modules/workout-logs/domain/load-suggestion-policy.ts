export interface PerformedSet {
  weight: number | null;
  reps: number | null;
}

export interface LoadSuggestion {
  /** Carga sugerida para hoje (kg), ou `null` quando não há base (sem carga registrada). */
  suggestedWeight: number | null;
  /** increase = bateu o topo da faixa em todas as séries · keep = repetir a carga. */
  suggestionKind: 'increase' | 'keep' | null;
}

const LIGHT_LOAD_LIMIT_KG = 20;
const LIGHT_LOAD_INCREMENT_KG = 1;
const HEAVY_LOAD_INCREMENT_KG = 2.5;

/** "10-12" → 12 · "10" → 10 · "8 a 10" → 10 · null/"" → null */
export function parseTopOfRepRange(prescribedReps: string | null | undefined): number | null {
  if (!prescribedReps) return null;
  const numbersInPrescription = prescribedReps.match(/\d+/g)?.map(Number) ?? [];
  return numbersInPrescription.length ? Math.max(...numbersInPrescription) : null;
}

/**
 * Sobrecarga progressiva simples: se na última vez TODAS as séries com carga
 * chegaram ao topo da faixa de repetições, sugere subir a carga; senão, manter.
 */
export function suggestNextLoad(lastPerformedSets: PerformedSet[], prescribedReps: string | null): LoadSuggestion {
  const setsWithWeight = lastPerformedSets.filter((performedSet) => (performedSet.weight ?? 0) > 0);
  if (setsWithWeight.length === 0) return { suggestedWeight: null, suggestionKind: null };

  const heaviestWeight = Math.max(...setsWithWeight.map((performedSet) => performedSet.weight as number));
  const topOfRepRange = parseTopOfRepRange(prescribedReps);
  const reachedTopInAllSets =
    topOfRepRange !== null &&
    setsWithWeight.every((performedSet) => (performedSet.reps ?? 0) >= topOfRepRange);

  if (!reachedTopInAllSets) return { suggestedWeight: heaviestWeight, suggestionKind: 'keep' };

  const increment = heaviestWeight < LIGHT_LOAD_LIMIT_KG ? LIGHT_LOAD_INCREMENT_KG : HEAVY_LOAD_INCREMENT_KG;
  return { suggestedWeight: heaviestWeight + increment, suggestionKind: 'increase' };
}
