import { Exercise } from '@prisma/client';

export const FAVORITE_EXERCISE_REPOSITORY = Symbol('FAVORITE_EXERCISE_REPOSITORY');

export interface FavoriteExerciseRepository {
  /** Exercícios favoritados pelo usuário, do mais recente para o mais antigo. */
  listFavoriteExercises(userId: string): Promise<Exercise[]>;
  /** Idempotente: favoritar duas vezes não duplica. */
  addFavorite(userId: string, exerciseId: string): Promise<void>;
  /** Idempotente: remover o que não existe não é erro. */
  removeFavorite(userId: string, exerciseId: string): Promise<void>;
  exerciseExists(exerciseId: string): Promise<boolean>;
}
