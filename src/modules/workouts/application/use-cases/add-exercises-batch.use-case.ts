import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { AddExercisesBatchDto } from '../dto/add-exercises-batch.dto';

/**
 * Adiciona N exercícios de uma vez (E7 — montador em lote).
 *
 * Existe porque montar um treino de 10 exercícios com o endpoint unitário eram
 * 10 round-trips independentes: se o 7º falhasse, o treino ficava pela metade e
 * o admin não tinha como saber onde parou. Aqui é tudo ou nada.
 */
@Injectable()
export class AddExercisesBatchUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
  ) {}

  async execute(workoutId: string, dto: AddExercisesBatchDto) {
    const workout = await this.repo.findById(workoutId);
    if (!workout) throw new NotFoundException('Treino não encontrado');

    // o mesmo exercício duas vezes no mesmo lote quase sempre é clique duplo,
    // não intenção — mantém o primeiro (com a config que o admin preencheu).
    const vistos = new Set<string>();
    const items = dto.items.filter((it) => {
      if (vistos.has(it.exerciseId)) return false;
      vistos.add(it.exerciseId);
      return true;
    });

    return this.repo.addExercisesBatch(workoutId, items);
  }
}
