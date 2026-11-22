import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  FAVORITE_EXERCISE_REPOSITORY,
  FavoriteExerciseRepository,
} from '../../domain/favorite-exercise.repository';

@Injectable()
export class ListFavoriteExercisesUseCase {
  constructor(
    @Inject(FAVORITE_EXERCISE_REPOSITORY)
    private readonly favoriteExerciseRepository: FavoriteExerciseRepository,
  ) {}

  execute(userId: string) {
    return this.favoriteExerciseRepository.listFavoriteExercises(userId);
  }
}

@Injectable()
export class AddFavoriteExerciseUseCase {
  constructor(
    @Inject(FAVORITE_EXERCISE_REPOSITORY)
    private readonly favoriteExerciseRepository: FavoriteExerciseRepository,
  ) {}

  async execute(userId: string, exerciseId: string) {
    if (!(await this.favoriteExerciseRepository.exerciseExists(exerciseId))) {
      throw new NotFoundException('Exercício não encontrado');
    }
    await this.favoriteExerciseRepository.addFavorite(userId, exerciseId);
    return { favorite: true };
  }
}

@Injectable()
export class RemoveFavoriteExerciseUseCase {
  constructor(
    @Inject(FAVORITE_EXERCISE_REPOSITORY)
    private readonly favoriteExerciseRepository: FavoriteExerciseRepository,
  ) {}

  async execute(userId: string, exerciseId: string) {
    await this.favoriteExerciseRepository.removeFavorite(userId, exerciseId);
    return { favorite: false };
  }
}
