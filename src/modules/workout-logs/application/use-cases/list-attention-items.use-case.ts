import { Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';
import { findTraineesNeedingAttention } from '../../domain/attention-rules';

const THIRTY_DAYS_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

/** Bloco "Precisa de atenção" do dashboard do personal. */
@Injectable()
export class ListAttentionItemsUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly workoutLogRepository: WorkoutLogRepository,
  ) {}

  async execute() {
    const skippedSince = new Date(Date.now() - THIRTY_DAYS_IN_MILLISECONDS);
    const traineeActivities = await this.workoutLogRepository.listTraineeActivities(skippedSince);
    return findTraineesNeedingAttention(traineeActivities);
  }
}
