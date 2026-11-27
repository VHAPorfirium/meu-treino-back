import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  TrainerAccessService,
  ensureTrainerAccess,
} from '../../../links/application/trainer-access.service';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { DuplicateWorkoutDto } from '../dto/duplicate-workout.dto';
import { assertWorkoutOwnership } from '../workout-ownership';

@Injectable()
export class DuplicateWorkoutUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
    @Optional()
    private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(id: string, dto: DuplicateWorkoutDto, trainerId?: string) {
    const src = await this.repo.findById(id);
    if (!src) throw new NotFoundException('Treino não encontrado');
    assertWorkoutOwnership(src, trainerId);

    const copyAssignees = dto.copyAssignees ?? false;
    const allowedAssigneeIds =
      copyAssignees && trainerId && ensureTrainerAccess(this.trainerAccess)
        ? await this.trainerAccess.getActiveTraineeIds(trainerId)
        : undefined;

    return this.repo.duplicate(id, {
      name: dto.name?.trim() || `${src.name} (cópia)`,
      copyAssignees,
      ownerTrainerId: trainerId ?? src.ownerTrainerId ?? undefined,
      allowedAssigneeIds,
    });
  }
}
