import { Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';

@Injectable()
export class OpenSessionUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly repo: WorkoutLogRepository,
  ) {}

  // Idempotente: se já há sessão aberta hoje p/ (user, workout), retorna ela.
  async execute(userId: string, workoutId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const existing = await this.repo.findOpenSession(
      userId,
      workoutId,
      startOfDay,
    );
    if (existing) return existing;

    return this.repo.open(userId, workoutId);
  }
}
