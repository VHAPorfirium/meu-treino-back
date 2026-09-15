import { Inject, Injectable } from '@nestjs/common';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepository,
  ListExercisesFilter,
  PaginatedExercises,
} from '../../domain/exercise.repository';
import { ListExercisesQuery } from '../dto/list-exercises.query';

// heurística: cuid começa com "c" e tem 25 chars; body_part é texto curto com espaço/minúsculas
function looksLikeId(value: string): boolean {
  return /^c[a-z0-9]{20,}$/i.test(value);
}

@Injectable()
export class ListExercisesUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly repo: ExerciseRepository,
  ) {}

  execute(query: ListExercisesQuery): Promise<PaginatedExercises> {
    const filter: ListExercisesFilter = {
      search: query.search,
      equipment: query.equipment,
      page: query.page,
      pageSize: query.pageSize,
    };

    if (query.muscleGroup) {
      if (looksLikeId(query.muscleGroup)) filter.muscleGroupId = query.muscleGroup;
      else filter.muscleGroupName = query.muscleGroup;
    }

    return this.repo.findMany(filter);
  }
}

/** Lista os equipamentos distintos do catálogo (alimenta o filtro do front). */
@Injectable()
export class ListEquipmentUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly repo: ExerciseRepository,
  ) {}

  execute(): Promise<string[]> {
    return this.repo.listEquipment();
  }
}
