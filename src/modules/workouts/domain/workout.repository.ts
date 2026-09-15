import { Prisma, Workout, WorkoutExercise } from '@prisma/client';

export const WORKOUT_REPOSITORY = Symbol('WORKOUT_REPOSITORY');

export type WorkoutWithExercises = Prisma.WorkoutGetPayload<{
  include: {
    exercises: { include: { exercise: true } };
    assignments: { include: { user: { select: { id: true; name: true } } } };
  };
}>;

export type AssigneeSummary = { id: string; name: string };

export interface WorkoutExerciseData {
  exerciseId: string;
  order: number;
  sets: number;
  reps: string;
  restSeconds?: number;
  notes?: string;
}

export interface WorkoutRepository {
  // ── criação / leitura (já existiam) ────────────────────────────────────────
  create(data: {
    name: string;
    dayOfWeek?: number;
    active?: boolean;
  }): Promise<Workout>;

  addExercise(
    workoutId: string,
    data: WorkoutExerciseData,
  ): Promise<WorkoutExercise>;

  /** Adiciona N exercícios numa transação, com `order` sequencial (E7). */
  addExercisesBatch(
    workoutId: string,
    items: Omit<WorkoutExerciseData, 'order'>[],
  ): Promise<WorkoutExercise[]>;

  findById(id: string): Promise<Workout | null>;

  /** Lista todos os treinos (contagem de exercícios + destinatários) — admin. */
  listAll(): Promise<any[]>;

  /** Treino com exercícios ordenados + destinatários — admin. */
  findByIdWithExercises(id: string): Promise<WorkoutWithExercises | null>;

  /** Alternativas de vários exercícios de uma vez (evita N+1). */
  findAlternativesForExercises(
    exerciseIds: string[],
  ): Promise<
    Record<
      string,
      {
        id: string;
        name: string;
        equipment: string | null;
        gifUrl: string | null;
        thumbnailUrl: string | null;
      }[]
    >
  >;

  // ── E1: CRUD ───────────────────────────────────────────────────────────────
  update(
    id: string,
    data: { name?: string; dayOfWeek?: number | null; active?: boolean },
  ): Promise<Workout>;

  /** Quantas sessões (WorkoutLog) referenciam o treino — protege o histórico. */
  countLogs(workoutId: string): Promise<number>;

  delete(id: string): Promise<void>;

  findExerciseInWorkout(
    workoutId: string,
    workoutExerciseId: string,
  ): Promise<WorkoutExercise | null>;

  updateExercise(
    workoutExerciseId: string,
    data: {
      sets?: number;
      reps?: string;
      restSeconds?: number | null;
      notes?: string | null;
    },
  ): Promise<WorkoutExercise>;

  /** Quantos logs referenciam este exercício do treino (FK sem cascade). */
  countExerciseLogs(workoutExerciseId: string): Promise<number>;

  /** Remove o exercício e reindexa `order` dos restantes (0..n-1) numa transação. */
  removeExerciseAndReindex(
    workoutId: string,
    workoutExerciseId: string,
  ): Promise<void>;

  // ── E1.1: direcionamento ───────────────────────────────────────────────────
  /** Substitui o conjunto de destinatários (idempotente). */
  setAssignees(workoutId: string, userIds: string[]): Promise<AssigneeSummary[]>;

  /** Treino ATIVO direcionado ao usuário para o dia da semana (mais recente). */
  findAssignedActiveByDay(
    userId: string,
    dayOfWeek: number,
  ): Promise<WorkoutWithExercises | null>;

  /** Qualquer treino ATIVO direcionado ao usuário (mais recente) — fallback. */
  findFirstAssignedActive(userId: string): Promise<WorkoutWithExercises | null>;

  /** Treinos direcionados ao usuário (ativos primeiro) — "meus treinos". */
  listAssigned(userId: string): Promise<any[]>;

  // ── E2: reordenar / duplicar ───────────────────────────────────────────────
  /** Aplica a nova ordem numa transação. Recebe o conjunto completo de ids do treino. */
  reorder(
    workoutId: string,
    items: { workoutExerciseId: string; order: number }[],
  ): Promise<void>;

  /** Copia treino + exercícios (e opcionalmente destinatários) numa transação. */
  duplicate(
    id: string,
    opts: { name: string; copyAssignees: boolean },
  ): Promise<Workout>;
}
