import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  TrainerAccessService,
  ensureTrainerAccess,
} from '../../../links/application/trainer-access.service';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';
import { findTraineesNeedingAttention } from '../../domain/attention-rules';

const THIRTY_DAYS_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

/** Bloco "Precisa de atenção" do dashboard do personal (apenas alunos vinculados ativos). */
@Injectable()
export class ListAttentionItemsUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly workoutLogRepository: WorkoutLogRepository,
    @Optional() private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(trainerId?: string) {
    let userIds: string[] | undefined;
    if (trainerId && ensureTrainerAccess(this.trainerAccess)) {
      userIds = await this.trainerAccess.getActiveTraineeIds(trainerId);
      if (userIds.length === 0) return [];
    }
    const skippedSince = new Date(Date.now() - THIRTY_DAYS_IN_MILLISECONDS);
    const traineeActivities =
      await this.workoutLogRepository.listTraineeActivities(skippedSince, userIds);
    return findTraineesNeedingAttention(traineeActivities);
  }
}
