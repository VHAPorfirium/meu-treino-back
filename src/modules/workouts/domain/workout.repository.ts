import { Prisma, Workout, WorkoutExercise } from '@prisma/client';

export const WORKOUT_REPOSITORY = Symbol('WORKOUT_REPOSITORY');

export type WorkoutWithExercises = Prisma.WorkoutGetPayload<{
  include: { exercises: { include: { exercise: true } } };
}>;

export interface WorkoutRepository {
  create(data: {
    name: string;
    dayOfWeek?: number;
    active?: boolean;
  }): Promise<Workout>;

  addExercise(
    workoutId: string,
    data: {
      exerciseId: string;
      order: number;
      sets: number;
      reps: string;
      restSeconds?: number;
      notes?: string;
    },
  ): Promise<WorkoutExercise>;

  findById(id: string): Promise<Workout | null>;

  /** Lista todos os treinos (com contagem de exercícios) — admin. */
  listAll(): Promise<any[]>;

  /** Treino com exercícios ordenados — admin. */
  findByIdWithExercises(id: string): Promise<WorkoutWithExercises | null>;

  /** Treino ativo do dia (dayOfWeek). Fallback: primeiro treino ativo. */
  findTodayWorkout(dayOfWeek: number): Promise<WorkoutWithExercises | null>;

  /** Alternativas de vários exercícios de uma vez (evita N+1). */
  findAlternativesForExercises(
    exerciseIds: string[],
  ): Promise<Record<string, { id: string; name: string; equipment: string | null; gifUrl: string | null; thumbnailUrl: string | null }[]>>;
}
