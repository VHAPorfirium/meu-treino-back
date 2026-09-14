import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { UpdateWorkoutExerciseDto } from '../dto/update-workout-exercise.dto';

@Injectable()
export class UpdateWorkoutExerciseUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
  ) {}

  async execute(
    workoutId: string,
    workoutExerciseId: string,
    dto: UpdateWorkoutExerciseDto,
  ) {
    // garante que o exercício pertence a ESTE treino (evita editar via id alheio)
    const we = await this.repo.findExerciseInWorkout(workoutId, workoutExerciseId);
    if (!we) throw new NotFoundException('Exercício não encontrado neste treino');
    return this.repo.updateExercise(workoutExerciseId, dto);
  }
}
