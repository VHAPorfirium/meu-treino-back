import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { AddExercisesBatchDto } from '../dto/add-exercises-batch.dto';
import { normalizaPrescricao } from '../prescricao';
import { assertWorkoutOwnership } from '../workout-ownership';

/**
 * Adiciona N exercícios de uma vez (E7 — montador em lote).
 */
@Injectable()
export class AddExercisesBatchUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
  ) {}

  async execute(workoutId: string, dto: AddExercisesBatchDto, trainerId?: string) {
    const workout = await this.repo.findById(workoutId);
    if (!workout) throw new NotFoundException('Treino não encontrado');
    assertWorkoutOwnership(workout, trainerId);

    const vistos = new Set<string>();
    const items = dto.items.filter((it) => {
      if (vistos.has(it.exerciseId)) return false;
      vistos.add(it.exerciseId);
      return true;
    });

    return this.repo.addExercisesBatch(workoutId, items.map(normalizaPrescricao));
  }
}
