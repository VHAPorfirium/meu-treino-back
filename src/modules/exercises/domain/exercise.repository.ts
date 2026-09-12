import { Exercise } from '@prisma/client';

export interface ListExercisesFilter {
  muscleGroupId?: string;
  muscleGroupName?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedExercises {
  items: Exercise[];
  total: number;
  page: number;
  pageSize: number;
}

export const EXERCISE_REPOSITORY = Symbol('EXERCISE_REPOSITORY');

export interface ExerciseRepository {
  findMany(filter: ListExercisesFilter): Promise<PaginatedExercises>;
  findById(id: string): Promise<Exercise | null>;
  /** Alternativas pré-computadas (mesmo target+bodyPart, equipamento diferente). */
  findAlternatives(exerciseId: string): Promise<Exercise[]>;
}
