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

  execute(userId: string) {
    return this.repo.historyByUser(userId);
  }
}
