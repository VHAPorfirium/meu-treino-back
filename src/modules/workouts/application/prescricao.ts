import { ExerciseMode } from '@prisma/client';
import { WorkoutExerciseData } from '../domain/workout.repository';

/** Forma comum dos DTOs que prescrevem um exercício (unitário e lote). */
export interface PrescricaoDto {
  exerciseId: string;
  mode?: ExerciseMode;
  sets?: number;
  reps?: string;
  durationSeconds?: number;
  restSeconds?: number;
  notes?: string;
}

/**
 * E10 — normaliza a prescrição num único lugar.
 *
 * Os dois modos são mutuamente exclusivos por construção: em TIME, `reps` vai
 * como `null` e `sets` vira 1 (um bloco de tempo); em REPS, `durationSeconds`
 * vai como `null`. Isso impede a linha inconsistente ("3 × 10 durante 20 min")
 * de existir no banco, em vez de tentar interpretá-la depois na leitura.
 */
export function normalizaPrescricao(
  dto: PrescricaoDto,
): Omit<WorkoutExerciseData, 'order'> {
  const mode = dto.mode ?? ExerciseMode.REPS;
  const comum = {
    exerciseId: dto.exerciseId,
    mode,
    restSeconds: dto.restSeconds,
    notes: dto.notes,
  };

  if (mode === ExerciseMode.TIME) {
    return {
      ...comum,
      sets: dto.sets ?? 1,
      reps: null,
      durationSeconds: dto.durationSeconds ?? null,
    };
  }

  return {
    ...comum,
    sets: dto.sets ?? 1,
    reps: dto.reps ?? null,
    durationSeconds: null,
  };
}
