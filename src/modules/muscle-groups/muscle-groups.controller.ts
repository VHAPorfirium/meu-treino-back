import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Controller('muscle-groups')
export class MuscleGroupsController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /api/muscle-groups — lista os 10 grupos com contagem de exercícios
  @Get()
  async list() {
    const groups = await this.prisma.muscleGroup.findMany({
      orderBy: { displayName: 'asc' },
      include: { _count: { select: { exercises: true } } },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      displayName: g.displayName,
      exerciseCount: g._count.exercises,
    }));
  }
}
