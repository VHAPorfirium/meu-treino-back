import { Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  diaDaSemanaLocal,
  diaLocal,
  proximaOcorrencia,
} from '../../../../shared/time/dia-local';

export type StatusDoDia = 'nao_iniciado' | 'em_andamento' | 'concluido';

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
    private readonly prisma: PrismaService,
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

    if (!workout) {
      return {
        workout: null,
        workoutLog: null,
        isFallback: false,
        status: 'nao_iniciado' as StatusDoDia,
        concluidoEm: null,
        proximaLiberacao: null,
      };
    }

    const exerciseIds = workout.exercises.map((we) => we.exerciseId);
    const altMap = await this.repo.findAlternativesForExercises(exerciseIds);

    /**
     * E9 — a sessão do dia, **aberta ou concluída**.
     *
     * Antes havia um `completed: false` aqui: assim que a aluna finalizava, a
     * sessão sumia da resposta, o front via `workoutLog: null` e voltava a
     * oferecer "Iniciar treino" — e um novo POST criava uma segunda sessão do
     * mesmo dia, que contava em dobro em todas as métricas.
     */
    const dayKey = diaLocal();
    const sessao = await this.prisma.workoutLog.findUnique({
      where: { userId_workoutId_dayKey: { userId, workoutId: workout.id, dayKey } },
      include: {
        exerciseLogs: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
      },
    });

    const status: StatusDoDia = !sessao
      ? 'nao_iniciado'
      : sessao.completed
        ? 'concluido'
        : 'em_andamento';

    return {
      isFallback,
      workoutLog: sessao,
      status,
      concluidoEm: sessao?.completed ? sessao.date.toISOString() : null,
      // só faz sentido quando está travado; 'YYYY-MM-DD' no fuso do app
      proximaLiberacao: sessao?.completed
        ? proximaOcorrencia(workout.dayOfWeek, dayKey)
        : null,
      workout: {
        id: workout.id,
        name: workout.name,
        dayOfWeek: workout.dayOfWeek,
        exercises: workout.exercises.map((we) => ({
          id: we.id,
          order: we.order,
          sets: we.sets,
          reps: we.reps,
          mode: we.mode, // E10
          durationSeconds: we.durationSeconds, // E10
          restSeconds: we.restSeconds,
          notes: we.notes,
          exercise: {
            id: we.exercise.id,
            name: we.exercise.name,
            target: we.exercise.target,
            bodyPart: we.exercise.bodyPart,
            equipment: we.exercise.equipment,
            gifUrl: we.exercise.gifUrl,
            thumbnailUrl: we.exercise.thumbnailUrl,
            instructions: we.exercise.instructions,
          },
          alternatives: altMap[we.exerciseId] ?? [],
        })),
      },
    };
  }
}
