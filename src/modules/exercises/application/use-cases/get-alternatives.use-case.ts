import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Exercise } from '@prisma/client';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepository,
} from '../../domain/exercise.repository';

@Injectable()
export class GetAlternativesUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly repo: ExerciseRepository,
  ) {}

  async execute(exerciseId: string): Promise<Exercise[]> {
    const base = await this.repo.findById(exerciseId);
    if (!base) throw new NotFoundException('Exercício não encontrado');
    return this.repo.findAlternatives(exerciseId);
  }
}
