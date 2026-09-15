import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Exercise } from '@prisma/client';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepository,
} from '../../domain/exercise.repository';
import { CacheService, TTL } from '../../../../shared/cache/cache.service';

@Injectable()
export class GetAlternativesUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly repo: ExerciseRepository,
    private readonly cache: CacheService,
  ) {}

  async execute(exerciseId: string): Promise<Exercise[]> {
    const base = await this.cache.lembrarGlobal(
      `ex:one:v1:${exerciseId}`,
      TTL.CATALOGO,
      () => this.repo.findById(exerciseId),
    );
    if (!base) throw new NotFoundException('Exercício não encontrado');
    return this.cache.lembrarGlobal(`ex:alt:v1:${exerciseId}`, TTL.CATALOGO, () =>
      this.repo.findAlternatives(exerciseId),
    );
  }
}
