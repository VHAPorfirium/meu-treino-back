import { Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';
import { calculateExerciseStats } from '../../domain/exercise-stats-calculator';

/** Números do aluno num exercício: melhor carga, vezes feito e evolução em 30 dias. */
@Injectable()
export class GetExerciseStatsUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly workoutLogRepository: WorkoutLogRepository,
  ) {}

  async execute(userId: string, exerciseId: string) {
    const performances = await this.workoutLogRepository.listExercisePerformances(userId, exerciseId);
    return calculateExerciseStats(performances);
  }
}
