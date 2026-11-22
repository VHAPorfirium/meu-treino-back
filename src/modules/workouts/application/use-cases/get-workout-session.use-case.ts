import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { WorkoutSessionBuilder } from '../services/workout-session-builder.service';

/**
 * Treino ESCOLHIDO pelo aluno na tela inicial (do desafio ou avulso), no mesmo
 * formato do treino de hoje. Só treinos direcionados a ele podem ser abertos.
 */
@Injectable()
export class GetWorkoutSessionUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly workoutRepository: WorkoutRepository,
    private readonly workoutSessionBuilder: WorkoutSessionBuilder,
  ) {}

  async execute(userId: string, workoutId: string) {
    const assignedWorkout = await this.workoutRepository.findAssignedById(userId, workoutId);
    if (!assignedWorkout) throw new NotFoundException('Treino não encontrado na sua lista');
    return this.workoutSessionBuilder.build(userId, assignedWorkout, false);
  }
}
