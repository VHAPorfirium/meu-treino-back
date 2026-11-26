import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { UpdateWorkoutDto } from '../dto/update-workout.dto';
import { assertWorkoutOwnership } from '../workout-ownership';

@Injectable()
export class UpdateWorkoutUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
  ) {}

  async execute(id: string, dto: UpdateWorkoutDto, trainerId?: string) {
    const workout = await this.repo.findById(id);
    if (!workout) throw new NotFoundException('Treino não encontrado');
    assertWorkoutOwnership(workout, trainerId);
    return this.repo.update(id, dto);
  }
}
