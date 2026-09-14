import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { ReorderExercisesDto } from '../dto/reorder-exercises.dto';

@Injectable()
export class ReorderExercisesUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
  ) {}

  async execute(workoutId: string, dto: ReorderExercisesDto) {
    const workout = await this.repo.findByIdWithExercises(workoutId);
    if (!workout) throw new NotFoundException('Treino não encontrado');

    // o conjunto enviado precisa ser EXATAMENTE o conjunto de exercícios do treino
    const current = new Set(workout.exercises.map((we) => we.id));
    const sent = new Set(dto.items.map((it) => it.workoutExerciseId));
    if (
      sent.size !== dto.items.length ||
      sent.size !== current.size ||
      [...sent].some((id) => !current.has(id))
    ) {
      throw new BadRequestException(
        'A lista deve conter todos os exercícios do treino, cada um uma única vez.',
      );
    }

    // `order` deve ser uma sequência contígua 1..n (padrão do projeto), sem buracos nem repetição
    const orders = dto.items.map((it) => it.order).sort((a, b) => a - b);
    if (orders[0] !== 1 || orders.some((o, i) => o !== i + 1)) {
      throw new BadRequestException('`order` deve ser uma sequência 1..n.');
    }

    await this.repo.reorder(workoutId, dto.items);
    return { ok: true };
  }
}
