import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CacheService, TTL } from '../../shared/cache/cache.service';

@Controller('muscle-groups')
export class MuscleGroupsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // GET /api/muscle-groups — lista os 10 grupos com contagem de exercícios
  @Get()
  list() {
    // igual pra todo mundo e só muda em reseed (G1)
    return this.cache.lembrarGlobal('mg:list:v1', TTL.CATALOGO, () =>
      this.carregar(),
    );
  }

  private async carregar() {
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
