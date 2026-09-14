import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';

@Injectable()
export class RemoveWorkoutExerciseUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
  ) {}

  async execute(workoutId: string, workoutExerciseId: string) {
    const we = await this.repo.findExerciseInWorkout(workoutId, workoutExerciseId);
    if (!we) throw new NotFoundException('Exercício não encontrado neste treino');

    // WorkoutExerciseLog → WorkoutExercise não tem cascade: com histórico, não remove.
    const logs = await this.repo.countExerciseLogs(workoutExerciseId);
    if (logs > 0) {
      throw new ConflictException(
        'Este exercício já foi executado em sessões registradas e não pode ser removido do treino.',
      );
    }

    await this.repo.removeExerciseAndReindex(workoutId, workoutExerciseId);
    return { ok: true };
  }
}
