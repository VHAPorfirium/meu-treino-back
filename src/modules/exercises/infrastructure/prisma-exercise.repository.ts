import { Injectable } from '@nestjs/common';
import { Exercise, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  ExerciseRepository,
  ListExercisesFilter,
  PaginatedExercises,
} from '../domain/exercise.repository';

@Injectable()
export class PrismaExerciseRepository implements ExerciseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(filter: ListExercisesFilter): Promise<PaginatedExercises> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));

    const where: Prisma.ExerciseWhereInput = {};
    if (filter.muscleGroupId) where.muscleGroupId = filter.muscleGroupId;
    if (filter.muscleGroupName)
      where.muscleGroup = { name: filter.muscleGroupName };
    if (filter.search)
      where.name = { contains: filter.search, mode: 'insensitive' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.exercise.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  findById(id: string): Promise<Exercise | null> {
    return this.prisma.exercise.findUnique({ where: { id } });
  }

  async findAlternatives(exerciseId: string): Promise<Exercise[]> {
    const rows = await this.prisma.exerciseAlternative.findMany({
      where: { baseExerciseId: exerciseId },
      include: { alt: true },
      orderBy: { alt: { name: 'asc' } },
    });
    return rows.map((r) => r.alt);
  }
}
