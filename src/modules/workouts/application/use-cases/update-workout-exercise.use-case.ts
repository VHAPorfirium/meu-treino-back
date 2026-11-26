import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExerciseMode } from '@prisma/client';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { UpdateWorkoutExerciseDto } from '../dto/update-workout-exercise.dto';
import { assertWorkoutOwnership } from '../workout-ownership';

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
    trainerId?: string,
  ) {
    if (trainerId) {
      const workout = await this.repo.findById(workoutId);
      if (!workout) throw new NotFoundException('Treino não encontrado');
      assertWorkoutOwnership(workout, trainerId);
    }

    // garante que o exercício pertence a ESTE treino (evita editar via id alheio)
    const we = await this.repo.findExerciseInWorkout(workoutId, workoutExerciseId);
    if (!we) throw new NotFoundException('Exercício não encontrado neste treino');

    const effectiveMode = dto.mode ?? we.mode;
    const nextReps = dto.reps !== undefined ? dto.reps : we.reps;
    const nextDuration =
      dto.durationSeconds !== undefined ? dto.durationSeconds : we.durationSeconds;

    if (effectiveMode === ExerciseMode.TIME) {
      if (!nextDuration || nextDuration < 1) {
        throw new BadRequestException(
          'durationSeconds é obrigatório e deve ser >= 1 no modo TIME',
        );
      }
      return this.repo.updateExercise(workoutExerciseId, {
        ...dto,
        mode: ExerciseMode.TIME,
        reps: null,
        durationSeconds: nextDuration,
      });
    }

    if (!nextReps || !nextReps.trim()) {
      throw new BadRequestException('reps é obrigatório no modo REPS');
    }
    return this.repo.updateExercise(workoutExerciseId, {
      ...dto,
      mode: ExerciseMode.REPS,
      reps: nextReps.trim(),
      durationSeconds: null,
    });
  }
}
