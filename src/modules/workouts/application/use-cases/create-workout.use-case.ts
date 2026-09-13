import { Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { CreateWorkoutDto } from '../dto/create-workout.dto';

@Injectable()
export class CreateWorkoutUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
  ) {}

  execute(dto: CreateWorkoutDto) {
    return this.repo.create(dto);
  }
}
