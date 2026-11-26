import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ExerciseMode } from '@prisma/client';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';
import { suggestNextLoad } from '../../domain/load-suggestion-policy';
import { diaLocal } from '../../../../shared/time/dia-local';

/**
 * "Última vez" de cada exercício do treino + sugestão de carga para hoje.
 * Resposta indexada pelo id do exercício NO TREINO (workoutExerciseId), que é
 * a chave que a tela de execução já usa.
 */
@Injectable()
export class GetLastPerformanceUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly workoutLogRepository: WorkoutLogRepository,
  ) {}

  async execute(userId: string, workoutId: string) {
    const assigned = await this.workoutLogRepository.findAssignedWorkout(userId, workoutId);
    if (!assigned) {
      throw new NotFoundException('Treino não encontrado na sua lista');
    }
    const prescribedExercises = await this.workoutLogRepository.listPrescribedExercises(workoutId);
    const lastPerformances = await this.workoutLogRepository.findLastPerformances(
      userId,
      prescribedExercises.map((prescribedExercise) => prescribedExercise.exerciseId),
      diaLocal(),
    );
    const lastPerformanceByExerciseId = new Map(
      lastPerformances.map((lastPerformance) => [lastPerformance.exerciseId, lastPerformance]),
    );

    const lastPerformanceByWorkoutExerciseId: Record<string, unknown> = {};
    for (const prescribedExercise of prescribedExercises) {
      const lastPerformance = lastPerformanceByExerciseId.get(prescribedExercise.exerciseId);
      if (!lastPerformance) continue;

      const loadSuggestion =
        prescribedExercise.mode === ExerciseMode.TIME
          ? { suggestedWeight: null, suggestionKind: null }
          : suggestNextLoad(lastPerformance.sets, prescribedExercise.reps);

      lastPerformanceByWorkoutExerciseId[prescribedExercise.workoutExerciseId] = {
        performedAt: lastPerformance.performedAt.toISOString(),
        loadUsed: lastPerformance.loadUsed,
        totalSeconds: lastPerformance.totalSeconds,
        sets: lastPerformance.sets,
        ...loadSuggestion,
      };
    }
    return lastPerformanceByWorkoutExerciseId;
  }
}
