import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';
import { diaLocal } from '../../../../shared/time/dia-local';

@Injectable()
export class OpenSessionUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly repo: WorkoutLogRepository,
  ) {}

  /**
   * E9 — uma sessão por treino por dia local.
   *
   * - já existe e está **aberta** → devolve ela (idempotente, como antes);
   * - já existe e está **concluída** → **409**, não cria outra;
   * - não existe → cria.
   *
   * A regra mora aqui, no servidor, e não só na tela: antes, um refresh bastava
   * pra criar uma segunda sessão do mesmo dia — que contava em dobro na
   * frequência, na aderência, no streak e no volume do dashboard.
   */
  async execute(userId: string, workoutId: string) {
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

    return this.repo.open(userId, workoutId, dayKey);
  }
}
