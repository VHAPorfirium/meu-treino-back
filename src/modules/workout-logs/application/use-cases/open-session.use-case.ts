import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';
import { CacheService } from '../../../../shared/cache/cache.service';
import { diaLocal } from '../../../../shared/time/dia-local';
import { invalidarProgresso } from './invalida-progresso';

@Injectable()
export class OpenSessionUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly repo: WorkoutLogRepository,
    private readonly cache: CacheService,
  ) {}

  /**
   * E9 — uma sessão por treino por dia local.
   *
   * - treino não existe ou não está direcionado ao usuário → **404**;
   * - já existe e está **aberta** → devolve ela (idempotente, como antes);
   * - já existe e está **concluída** → **409**, não cria outra;
   * - treino inativo → **400**;
   * - não existe → cria.
   */
  async execute(userId: string, workoutId: string) {
    const assigned = await this.repo.findAssignedWorkout(userId, workoutId);
    if (!assigned) {
      throw new NotFoundException('Treino não encontrado na sua lista');
    }

    const dayKey = diaLocal();

    const existente = await this.repo.findSessionOfDay(userId, workoutId, dayKey);
    if (existente) {
      if (existente.completed) {
        throw new ConflictException(
          'Este treino já foi concluído hoje. Ele volta a ficar disponível no próximo dia programado.',
        );
      }
      return existente;
    }

    if (!assigned.active) {
      throw new BadRequestException('Este treino está inativo');
    }

    try {
      const opened = await this.repo.open(userId, workoutId, dayKey);
      await invalidarProgresso(this.cache, userId);
      return opened;
    } catch (err) {
      // Corrida concorrente de dois POST /workout-logs simultâneos no mesmo dia
      if ((err as { code?: string })?.code === 'P2002') {
        const concurrent = await this.repo.findSessionOfDay(userId, workoutId, dayKey);
        if (concurrent) {
          if (concurrent.completed) {
            throw new ConflictException(
              'Este treino já foi concluído hoje. Ele volta a ficar disponível no próximo dia programado.',
            );
          }
          return concurrent;
        }
      }
      throw err;
    }
  }
}
