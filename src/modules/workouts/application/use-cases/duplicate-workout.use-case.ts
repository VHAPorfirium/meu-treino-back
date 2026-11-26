import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
  ) {}

  async execute(id: string, dto: DuplicateWorkoutDto, trainerId?: string) {
    const src = await this.repo.findById(id);
    if (!src) throw new NotFoundException('Treino não encontrado');
    assertWorkoutOwnership(src, trainerId);
    return this.repo.duplicate(id, {
      name: dto.name?.trim() || `${src.name} (cópia)`,
      copyAssignees: dto.copyAssignees ?? false,
      ownerTrainerId: trainerId ?? src.ownerTrainerId ?? undefined,
    });
  }
}
