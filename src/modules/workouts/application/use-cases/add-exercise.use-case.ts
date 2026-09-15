import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { AddExerciseDto } from '../dto/add-exercise.dto';
import { normalizaPrescricao } from '../prescricao';

@Injectable()
export class AddExerciseUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
  ) {}

  async execute(workoutId: string, dto: AddExerciseDto) {
    const workout = await this.repo.findById(workoutId);
    if (!workout) throw new NotFoundException('Treino não encontrado');
    return this.repo.addExercise(workoutId, {
      ...normalizaPrescricao(dto),
      order: dto.order,
    });
  }
}
