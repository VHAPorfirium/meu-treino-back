import { ExerciseMode, ExerciseStatus, Prisma, WorkoutLog } from '@prisma/client';
import { ExercisePerformanceRecord } from './exercise-stats-calculator';
import { TraineeActivity } from './attention-rules';

export const WORKOUT_LOG_REPOSITORY = Symbol('WORKOUT_LOG_REPOSITORY');

export type WorkoutLogWithEntries = Prisma.WorkoutLogGetPayload<{
  include: { exerciseLogs: { include: { sets: true } } };
}>;

export interface SetLogInput {
  setNumber: number;
  weight?: number | null;
  reps?: number | null;
  /** E10 — duração da série/bloco em segundos (cardio, prancha, alongamento). */
  durationSeconds?: number | null;
}

export interface UpsertExerciseLogData {
  status: ExerciseStatus;
  actualExerciseId?: string | null;
  loadUsed?: number | null;
  setsCompleted?: number | null;
  note?: string | null;
  /** E10 — agregado: soma dos `durationSeconds` das séries. */
  totalSeconds?: number | null;
  /** E4 — quando presente, SUBSTITUI todas as séries do registro (replace). */
  sets?: SetLogInput[];
}

/** Como o aluno fez um exercício da última vez (antes de hoje). */
export interface LastPerformanceRecord {
  exerciseId: string;
  performedAt: Date;
  loadUsed: number | null;
  totalSeconds: number | null;
  sets: { setNumber: number; weight: number | null; reps: number | null; durationSeconds: number | null }[];
}

export interface PrescribedWorkoutExercise {
  workoutExerciseId: string;
  exerciseId: string;
  mode: ExerciseMode;
  reps: string | null;
}

export interface WorkoutLogRepository {
  /**
   * E9 — a sessão de um DIA LOCAL, esteja ela aberta ou concluída.
   *
   * Substituiu o antigo `findOpenSession`, que filtrava por `completed: false`:
   * era isso que fazia o treino concluído "sumir" e reaparecer como disponível.
   */
  findSessionOfDay(
    userId: string,
    workoutId: string,
    dayKey: string,
  ): Promise<WorkoutLogWithEntries | null>;

  open(
    userId: string,
    workoutId: string,
    dayKey: string,
  ): Promise<WorkoutLogWithEntries>;

  findById(id: string): Promise<WorkoutLog | null>;

  upsertExerciseLog(
    workoutLogId: string,
    workoutExerciseId: string,
    data: UpsertExerciseLogData,
  ): Promise<void>;

  complete(id: string): Promise<WorkoutLog>;

  history(opts?: { limit?: number; offset?: number }): Promise<any[]>;

  historyByUser(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<any[]>;

  /** Todos os exercise logs com joins p/ analytics. */
  allExerciseLogs(since?: Date): Promise<any[]>;

  countSessions(since: Date): Promise<number>;

  /** Exercícios prescritos de um treino (para "última vez" e sugestão de carga). */
  listPrescribedExercises(workoutId: string): Promise<PrescribedWorkoutExercise[]>;

  /** Registro mais recente de cada exercício feito pelo aluno antes de `beforeDayKey`. */
  findLastPerformances(
    userId: string,
    exerciseIds: string[],
    beforeDayKey: string,
  ): Promise<LastPerformanceRecord[]>;

  /** Todas as vezes que o aluno fez o exercício (feito ou como substituto), em ordem cronológica. */
  listExercisePerformances(userId: string, exerciseId: string): Promise<ExercisePerformanceRecord[]>;

  /** Treino direcionado ao usuário (autorização de sessão e última performance). */
  findAssignedWorkout(
    userId: string,
    workoutId: string,
  ): Promise<{ id: string; active: boolean } | null>;

  /** Confirma se o exercício prescrito pertence ao treino da sessão. */
  workoutExerciseBelongsToWorkout(
    workoutId: string,
    workoutExerciseId: string,
  ): Promise<boolean>;

  /** Confirma se o exercício substituto existe no catálogo. */
  exerciseExists(exerciseId: string): Promise<boolean>;

  /** Último treino concluído e exercício mais pulado de cada aluno (TRAINEE). */
  listTraineeActivities(skippedSince: Date): Promise<TraineeActivity[]>;
}
