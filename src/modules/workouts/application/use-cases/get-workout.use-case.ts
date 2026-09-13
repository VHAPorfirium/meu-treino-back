import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';

@Injectable()
export class GetWorkoutUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
  ) {}

  async execute(id: string) {
    const workout = await this.repo.findByIdWithExercises(id);
    if (!workout) throw new NotFoundException('Treino não encontrado');
    return workout;
  }
}
