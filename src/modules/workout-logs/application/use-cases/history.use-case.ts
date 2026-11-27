import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  TrainerAccessService,
  ensureTrainerAccess,
} from '../../../links/application/trainer-access.service';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';

@Injectable()
export class HistoryUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly repo: WorkoutLogRepository,
    @Optional() private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(
    opts?: { limit?: number; offset?: number },
    trainerId?: string,
  ): Promise<{
    items: any[];
    total: number;
  }> {
    let userIds: string[] | undefined;
    if (trainerId && ensureTrainerAccess(this.trainerAccess)) {
      userIds = await this.trainerAccess.getActiveTraineeIds(trainerId);
      if (userIds.length === 0) return { items: [], total: 0 };
    }
    const [items, total] = await Promise.all([
      this.repo.history(userIds ? { ...opts, userIds } : opts),
      this.repo.countHistory(userIds),
    ]);
    return { items, total };
  }
}
