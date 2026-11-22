import { Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { diaDaSemanaLocal } from '../../../../shared/time/dia-local';
import {
  EMPTY_SESSION_RESPONSE,
  WorkoutSessionBuilder,
} from '../services/workout-session-builder.service';

export type { StatusDoDia } from '../services/workout-session-builder.service';

/**
 * Treino "de hoje" do usuário logado (E1.1 — só treinos DIRECIONADOS a ele):
 *   1) ativo direcionado com dayOfWeek == hoje  → isFallback: false
 *   2) senão, qualquer ativo direcionado         → isFallback: true  ("sugerido")
 *   3) senão, null                                → sem treino atribuído / descanso
 */
@Injectable()
export class GetTodayWorkoutUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
    private readonly workoutSessionBuilder: WorkoutSessionBuilder,
  ) {}

  async execute(userId: string, dayOfWeekOverride?: number) {
    // `diaDaSemanaLocal()` e não `new Date().getDay()`: o servidor roda em UTC e
    // depois das 21h em Brasília já estaria no dia seguinte (E9).
    const dayOfWeek = dayOfWeekOverride ?? diaDaSemanaLocal();

    let isFallback = false;
    let workout = await this.repo.findAssignedActiveByDay(userId, dayOfWeek);
    if (!workout) {
      workout = await this.repo.findFirstAssignedActive(userId);
      isFallback = workout !== null;
    }

    if (!workout) return EMPTY_SESSION_RESPONSE;
    return this.workoutSessionBuilder.build(userId, workout, isFallback);
  }
}
