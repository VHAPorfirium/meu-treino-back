import { ExerciseStatus, Prisma, WorkoutLog } from '@prisma/client';

export const WORKOUT_LOG_REPOSITORY = Symbol('WORKOUT_LOG_REPOSITORY');

export type WorkoutLogWithEntries = Prisma.WorkoutLogGetPayload<{
  include: { exerciseLogs: { include: { sets: true } } };
}>;

export interface SetLogInput {
  setNumber: number;
  weight?: number | null;
  reps?: number | null;
}

export interface UpsertExerciseLogData {
  status: ExerciseStatus;
  actualExerciseId?: string | null;
  loadUsed?: number | null;
  setsCompleted?: number | null;
  note?: string | null;
  /** E4 — quando presente, SUBSTITUI todas as séries do registro (replace). */
  sets?: SetLogInput[];
}

export interface WorkoutLogRepository {
  findOpenSession(
    userId: string,
    workoutId: string,
    since: Date,
  ): Promise<WorkoutLogWithEntries | null>;

  open(userId: string, workoutId: string): Promise<WorkoutLogWithEntries>;

  findById(id: string): Promise<WorkoutLog | null>;

  upsertExerciseLog(
    workoutLogId: string,
    workoutExerciseId: string,
    data: UpsertExerciseLogData,
  ): Promise<void>;

  complete(id: string): Promise<WorkoutLog>;

  history(): Promise<any[]>;

  historyByUser(userId: string): Promise<any[]>;

  /** Todos os exercise logs com joins p/ analytics. */
  allExerciseLogs(since?: Date): Promise<any[]>;

  countSessions(since: Date): Promise<number>;
}
