import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';
import { CacheService } from '../../../../shared/cache/cache.service';
import { invalidarProgresso } from './invalida-progresso';

@Injectable()
export class CompleteSessionUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly repo: WorkoutLogRepository,
    private readonly cache: CacheService,
  ) {}

  async execute(userId: string, logId: string) {
    const log = await this.repo.findById(logId);
    if (!log) throw new NotFoundException('Sessão não encontrada');
    if (log.userId !== userId)
      throw new ForbiddenException('Sessão de outro usuário');
    const feito = await this.repo.complete(logId);
    await invalidarProgresso(this.cache, userId);
    return feito;
  }
}
