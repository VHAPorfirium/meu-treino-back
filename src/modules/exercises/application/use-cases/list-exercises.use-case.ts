import { Inject, Injectable } from '@nestjs/common';
import {
  EquipamentoOpcao,
  EXERCISE_REPOSITORY,
  ExerciseRepository,
  ListExercisesFilter,
  PaginatedExercises,
} from '../../domain/exercise.repository';
import { ListExercisesQuery } from '../dto/list-exercises.query';
import { CacheService, TTL } from '../../../../shared/cache/cache.service';

// heurística: cuid começa com "c" e tem 25 chars; body_part é texto curto com espaço/minúsculas
function looksLikeId(value: string): boolean {
  return /^c[a-z0-9]{20,}$/i.test(value);
}

/**
 * Chave do cache a partir dos filtros JÁ NORMALIZADOS (não da querystring crua).
 *
 * Por que normalizar: `?a=1&b=2` e `?b=2&a=1` são a mesma consulta, e `?page=1` e
 * `?page=1&pageSize=24` também (24 é o default). Sem isso o cache fragmenta em
 * variantes que nunca se reencontram — ocupa memória e quase nunca acerta.
 *
 * Os valores vêm do DTO, que já passou pelo ValidationPipe (`whitelist`), então
 * não há como injetar chave arbitrária por aqui.
 */
function chaveDaBusca(f: ListExercisesFilter): string {
  const partes = [
    `g=${f.muscleGroupId ?? f.muscleGroupName ?? ''}`,
    `e=${(f.equipment ?? '').trim().toLowerCase()}`,
    `s=${(f.search ?? '').trim().toLowerCase()}`,
    `p=${f.page ?? 1}`,
    `n=${f.pageSize ?? ''}`,
  ];
  return `ex:list:v1:${partes.join('&')}`;
}

@Injectable()
export class ListExercisesUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly repo: ExerciseRepository,
    private readonly cache: CacheService,
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

    // GLOBAL de propósito: o catálogo é idêntico para todo mundo — não há dado
    // de usuário nesta resposta. Rotas por usuário usam `lembrarDoUsuario`.
    return this.cache.lembrarGlobal(chaveDaBusca(filter), TTL.CATALOGO, () =>
      this.repo.findMany(filter),
    );
  }
}

/** Lista os equipamentos distintos do catálogo (alimenta o filtro do front). */
@Injectable()
export class ListEquipmentUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly repo: ExerciseRepository,
    private readonly cache: CacheService,
  ) {}

  execute(): Promise<EquipamentoOpcao[]> {
    // era um `distinct` varrendo as 1.324 linhas a cada abertura do picker
    return this.cache.lembrarGlobal('ex:equip:v1', TTL.CATALOGO, () =>
      this.repo.listEquipment(),
    );
  }
}
