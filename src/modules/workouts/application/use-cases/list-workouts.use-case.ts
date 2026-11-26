import { Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';

@Injectable()
export class ListWorkoutsUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
  ) {}

  execute(ownerTrainerId?: string) {
    return this.repo.listAll(ownerTrainerId);
  }
}
