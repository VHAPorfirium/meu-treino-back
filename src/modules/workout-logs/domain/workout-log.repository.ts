import { ExerciseStatus, Prisma, WorkoutLog } from '@prisma/client';

export const WORKOUT_LOG_REPOSITORY = Symbol('WORKOUT_LOG_REPOSITORY');

export type WorkoutLogWithEntries = Prisma.WorkoutLogGetPayload<{
  include: { exerciseLogs: true };
}>;

export interface UpsertExerciseLogData {
  status: ExerciseStatus;
  actualExerciseId?: string | null;
  loadUsed?: number | null;
  setsCompleted?: number | null;
  note?: string | null;
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
