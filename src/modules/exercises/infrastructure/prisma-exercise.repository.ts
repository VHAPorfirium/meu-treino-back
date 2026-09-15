import { Injectable } from '@nestjs/common';
import { Exercise, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  ExerciseRepository,
  ListExercisesFilter,
  PaginatedExercises,
} from '../domain/exercise.repository';

/** Teto por página. Alto o bastante pra "trazer tudo" em poucas páginas, baixo o
 *  bastante pra não estourar payload/memória com 1.324 registros de uma vez. */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 24; // divisível por 2/3/4 → grid fecha certinho

@Injectable()
export class PrismaExerciseRepository implements ExerciseRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Monta o WHERE a partir dos filtros (todos combináveis entre si). */
  private buildWhere(filter: ListExercisesFilter): Prisma.ExerciseWhereInput {
    const where: Prisma.ExerciseWhereInput = {};

    if (filter.muscleGroupId) where.muscleGroupId = filter.muscleGroupId;
    if (filter.muscleGroupName)
      where.muscleGroup = { name: filter.muscleGroupName };
    if (filter.equipment) where.equipment = filter.equipment;

    const q = filter.search?.trim();
    if (q) {
      // busca livre em vários campos — o placeholder promete "nome ou equipamento"
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { equipment: { contains: q, mode: 'insensitive' } },
        { target: { contains: q, mode: 'insensitive' } },
        { bodyPart: { contains: q, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  async findMany(filter: ListExercisesFilter): Promise<PaginatedExercises> {
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, filter.pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const where = this.buildWhere(filter);

    // conta primeiro pra poder AJUSTAR a página pedida ao intervalo válido:
    // assim "página 999" devolve a última página com itens, não uma lista vazia.
    const total = await this.prisma.exercise.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, filter.page ?? 1), totalPages);

    const items = total
      ? await this.prisma.exercise.findMany({
          where,
          // `id` como desempate garante ordem estável entre páginas
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        })
      : [];

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    };
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

  async listEquipment(): Promise<string[]> {
    const rows = await this.prisma.exercise.findMany({
      where: { equipment: { not: null } },
      distinct: ['equipment'],
      select: { equipment: true },
      orderBy: { equipment: 'asc' },
    });
    return rows
      .map((r) => r.equipment)
      .filter((e): e is string => typeof e === 'string' && e.length > 0);
  }
}
