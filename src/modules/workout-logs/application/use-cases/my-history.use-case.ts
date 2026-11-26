import { Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';

@Injectable()
export class MyHistoryUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly repo: WorkoutLogRepository,
  ) {}

  async execute(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<{ items: any[]; total: number }> {
    const [items, total] = await Promise.all([
      this.repo.historyByUser(userId, opts),
      this.repo.countHistoryByUser(userId),
    ]);
    return { items, total };
  }
}
