import { Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';

@Injectable()
export class HistoryUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly repo: WorkoutLogRepository,
  ) {}

  async execute(opts?: { limit?: number; offset?: number }): Promise<{
    items: any[];
    total: number;
  }> {
    const [items, total] = await Promise.all([
      this.repo.history(opts),
      this.repo.countHistory(),
    ]);
    return { items, total };
  }
}
