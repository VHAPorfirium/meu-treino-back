import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { TrainerAccessService } from '../../../links/application/trainer-access.service';

@Injectable()
export class ListWorkoutsUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
    @Optional() private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(ownerTrainerId?: string) {
    const workouts = await this.repo.listAll(ownerTrainerId);
    if (!ownerTrainerId || !this.trainerAccess) return workouts;

    // Ex-alunos (vínculo ENDED) continuam com o treino, mas não aparecem para o personal.
    const activeSet = new Set(
      await this.trainerAccess.getActiveTraineeIds(ownerTrainerId),
    );
    return workouts.map((w: { assignees?: { id: string }[] }) => ({
      ...w,
      assignees: (w.assignees ?? []).filter((a) => activeSet.has(a.id)),
    }));
  }
}
