import { Exercise } from '@prisma/client';

export interface ListExercisesFilter {
  muscleGroupId?: string;
  muscleGroupName?: string;
  /** busca livre: nome, equipamento, músculo alvo ou parte do corpo */
  search?: string;
  /** filtro exato por equipamento (ex: "barbell") */
  equipment?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Página de resultados com TODA a informação necessária pra navegar sem perder
 * item nenhum: além dos itens, quantos existem no total (com os filtros aplicados),
 * quantas páginas, e se há anterior/próxima. `page` volta já ajustada ao intervalo
 * válido — pedir página 999 devolve a última, nunca uma lista vazia sem explicação.
 */
export interface PaginatedExercises {
  items: Exercise[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export const EXERCISE_REPOSITORY = Symbol('EXERCISE_REPOSITORY');

export interface ExerciseRepository {
  findMany(filter: ListExercisesFilter): Promise<PaginatedExercises>;
  findById(id: string): Promise<Exercise | null>;
  /** Alternativas pré-computadas (mesmo target+bodyPart, equipamento diferente). */
  findAlternatives(exerciseId: string): Promise<Exercise[]>;
  /** Equipamentos distintos existentes no catálogo (alimenta o filtro). */
  listEquipment(): Promise<string[]>;
}
