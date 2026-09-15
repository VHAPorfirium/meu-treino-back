import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Exercise } from '@prisma/client';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepository,
} from '../../domain/exercise.repository';
import { CacheService, TTL } from '../../../../shared/cache/cache.service';

@Injectable()
export class GetExerciseUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly repo: ExerciseRepository,
    private readonly cache: CacheService,
  ) {}

  async execute(id: string): Promise<Exercise> {
    // só o achado entra no cache: 404 não é resposta pra guardar por 6 h
    const ex = await this.cache.lembrarGlobal(`ex:one:v1:${id}`, TTL.CATALOGO, () =>
      this.repo.findById(id),
    );
    if (!ex) throw new NotFoundException('Exercício não encontrado');
    return ex;
  }
}
