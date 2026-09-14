import { Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';

/** E1.1 — "meus treinos": os direcionados ao usuário logado (TRAINEE). */
@Injectable()
export class ListMyWorkoutsUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
  ) {}

  execute(userId: string) {
    return this.repo.listAssigned(userId);
  }
}
