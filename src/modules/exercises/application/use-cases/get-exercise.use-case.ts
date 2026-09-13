import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Exercise } from '@prisma/client';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepository,
} from '../../domain/exercise.repository';

@Injectable()
export class GetExerciseUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly repo: ExerciseRepository,
  ) {}

  async execute(id: string): Promise<Exercise> {
    const ex = await this.repo.findById(id);
    if (!ex) throw new NotFoundException('Exercício não encontrado');
    return ex;
  }
}
