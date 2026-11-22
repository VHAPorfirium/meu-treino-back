import { Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
  WorkoutWithExercises,
} from '../../domain/workout.repository';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { diaLocal, proximaOcorrencia } from '../../../../shared/time/dia-local';

export type StatusDoDia = 'nao_iniciado' | 'em_andamento' | 'concluido';

export const EMPTY_SESSION_RESPONSE = {
  workout: null,
  workoutLog: null,
  isFallback: false,
  status: 'nao_iniciado' as StatusDoDia,
  concluidoEm: null,
  proximaLiberacao: null,
};

/**
 * Monta a resposta "treino + sessão do dia" que a tela de execução consome.
 * Usada tanto pelo treino recomendado de hoje quanto por um treino escolhido
 * pelo aluno na tela inicial — as duas telas recebem exatamente o mesmo formato.
 */
@Injectable()
export class WorkoutSessionBuilder {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly workoutRepository: WorkoutRepository,
    private readonly prisma: PrismaService,
  ) {}

  async build(userId: string, workout: WorkoutWithExercises, isFallback: boolean) {
    const exerciseIds = workout.exercises.map((workoutExercise) => workoutExercise.exerciseId);
    const alternativesByExerciseId = await this.workoutRepository.findAlternativesForExercises(exerciseIds);

    /**
     * E9 — a sessão do dia, **aberta ou concluída**. Se ela sumisse ao ser
     * concluída, o front voltaria a oferecer "Iniciar treino" e criaria uma
     * segunda sessão do mesmo dia, contando em dobro nas métricas.
     */
    const todayDayKey = diaLocal();
    const sessionOfDay = await this.prisma.workoutLog.findUnique({
      where: { userId_workoutId_dayKey: { userId, workoutId: workout.id, dayKey: todayDayKey } },
      include: {
        exerciseLogs: { include: { sets: { orderBy: { setNumber: 'asc' } } } },
      },
    });

    const status: StatusDoDia = !sessionOfDay
      ? 'nao_iniciado'
      : sessionOfDay.completed
        ? 'concluido'
        : 'em_andamento';

    return {
      isFallback,
      workoutLog: sessionOfDay,
      status,
      concluidoEm: sessionOfDay?.completed ? sessionOfDay.date.toISOString() : null,
      proximaLiberacao: sessionOfDay?.completed
        ? proximaOcorrencia(workout.dayOfWeek, todayDayKey)
        : null,
      workout: {
        id: workout.id,
        name: workout.name,
        dayOfWeek: workout.dayOfWeek,
        exercises: workout.exercises.map((workoutExercise) => ({
          id: workoutExercise.id,
          order: workoutExercise.order,
          sets: workoutExercise.sets,
          reps: workoutExercise.reps,
          mode: workoutExercise.mode, // E10
          durationSeconds: workoutExercise.durationSeconds, // E10
          restSeconds: workoutExercise.restSeconds,
          notes: workoutExercise.notes,
          exercise: {
            id: workoutExercise.exercise.id,
            name: workoutExercise.exercise.name,
            namePt: workoutExercise.exercise.namePt, // E11
            target: workoutExercise.exercise.target,
            targetPt: workoutExercise.exercise.targetPt,
            bodyPart: workoutExercise.exercise.bodyPart, // o front usa pra sugerir modo TIME
            equipment: workoutExercise.exercise.equipment,
            equipmentPt: workoutExercise.exercise.equipmentPt,
            gifUrl: workoutExercise.exercise.gifUrl,
            thumbnailUrl: workoutExercise.exercise.thumbnailUrl,
            instructions: workoutExercise.exercise.instructions,
          },
          alternatives: alternativesByExerciseId[workoutExercise.exerciseId] ?? [],
        })),
      },
    };
  }
}
