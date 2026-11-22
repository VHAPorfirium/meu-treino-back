import { Injectable } from '@nestjs/common';
import { Exercise } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { FavoriteExerciseRepository } from '../domain/favorite-exercise.repository';

@Injectable()
export class PrismaFavoriteExerciseRepository implements FavoriteExerciseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listFavoriteExercises(userId: string): Promise<Exercise[]> {
    const favorites = await this.prisma.favoriteExercise.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { exercise: true },
    });
    return favorites.map((favorite) => favorite.exercise);
  }

  async addFavorite(userId: string, exerciseId: string): Promise<void> {
    await this.prisma.favoriteExercise.upsert({
      where: { userId_exerciseId: { userId, exerciseId } },
      create: { userId, exerciseId },
      update: {},
    });
  }

  async removeFavorite(userId: string, exerciseId: string): Promise<void> {
    await this.prisma.favoriteExercise.deleteMany({ where: { userId, exerciseId } });
  }

  async exerciseExists(exerciseId: string): Promise<boolean> {
    return (await this.prisma.exercise.count({ where: { id: exerciseId } })) > 0;
  }
}
