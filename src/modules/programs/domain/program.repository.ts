import { Prisma, ProgramStatus, ProgramType } from '@prisma/client';
import { ProgramReport } from './program-report';
import { SessionLoadRecords } from './load-evolution-calculator';

export const PROGRAM_REPOSITORY = Symbol('PROGRAM_REPOSITORY');

export const PROGRAM_WORKOUT_SELECT = {
  id: true,
  name: true,
  dayOfWeek: true,
  active: true,
} as const;

export type ProgramWithDetails = Prisma.TrainingProgramGetPayload<{
  include: {
    workouts: { select: typeof PROGRAM_WORKOUT_SELECT };
    assignments: { include: { user: { select: { id: true; name: true } } } };
  };
}>;

export type AssignmentWithProgram = Prisma.ProgramAssignmentGetPayload<{
  include: { program: { include: { workouts: { select: typeof PROGRAM_WORKOUT_SELECT } } } };
}>;

export interface CreateProgramData {
  name: string;
  description: string | null;
  type: ProgramType;
  targetWeeks: number | null;
  targetDays: number | null;
  workoutIds: string[];
  ownerTrainerId?: string;
}

export interface UpdateProgramData {
  name?: string;
  description?: string | null;
  workoutIds?: string[];
  /** Restringe sincronização de WorkoutAssignment aos alunos com vínculo ACTIVE. */
  allowedUserIds?: string[];
}

export interface CompletedProgramSession extends SessionLoadRecords {
  dayKey: string;
}

/** Resumo mínimo para cálculo em lote de progresso de múltiplos participantes. */
export interface CompletedProgramSessionDay {
  userId: string;
  workoutId: string;
  dayKey: string;
  programAssignmentId?: string | null;
}

/** Status em que o aluno ainda "está" no programa (aparece na tela dele). */
export const CURRENT_ASSIGNMENT_STATUSES: ProgramStatus[] = [
  ProgramStatus.ACTIVE,
  ProgramStatus.COMPLETED,
];

export interface ProgramRepository {
  createProgram(programData: CreateProgramData): Promise<ProgramWithDetails>;

  /** Atualiza dados e, se vierem `workoutIds`, sincroniza os treinos do programa
   *  e os direciona a quem já participa dele. */
  updateProgram(programId: string, programData: UpdateProgramData): Promise<ProgramWithDetails>;

  deleteProgram(programId: string): Promise<void>;

  /** Remove o programa da carteira do personal sem apagar medalhas/desafios por cascade. */
  detachProgramOwner?(programId: string): Promise<void>;

  findProgramById(programId: string): Promise<ProgramWithDetails | null>;

  listPrograms(ownerTrainerId?: string): Promise<ProgramWithDetails[]>;

  /** Retorna os IDs existentes (e pertencentes ao personal, se informado) dentre `workoutIds`. */
  findExistingWorkoutIds(workoutIds: string[], ownerTrainerId?: string): Promise<string[]>;

  /** Participação atual do aluno (ACTIVE ou COMPLETED ainda não arquivada). */
  findCurrentAssignmentByUser(userId: string): Promise<AssignmentWithProgram | null>;

  findAssignmentById(assignmentId: string): Promise<AssignmentWithProgram | null>;

  listCompletedAssignmentsByUser(userId: string): Promise<AssignmentWithProgram[]>;

  /**
   * Arquiva participações atuais (ACTIVE/COMPLETED) de outros programas — ou de rodadas
   * já concluídas do mesmo programa — cria as novas participações e direciona os treinos
   * aos alunos em uma ÚNICA transação atômica com lock por aluno.
   * Retorna os IDs dos alunos efetivamente incluídos (ignora quem já estava ACTIVE neste programa).
   */
  assignProgramToUsers(programId: string, userIds: string[], startDayKey: string): Promise<string[]>;

  /** Arquiva a participação e retira do aluno os treinos daquele programa, numa transação. */
  archiveAssignment(assignmentId: string): Promise<void>;

  /**
   * Marca a participação como COMPLETED somente se ela ainda estiver ACTIVE (transição
   * condicional sob lock do aluno). Retorna `false` se outra operação já mudou o status.
   */
  markAssignmentCompleted(assignmentId: string, programReport: ProgramReport): Promise<boolean>;

  /** Sessões concluídas pelo aluno no programa (via programAssignmentId ou treinos do programa) desde o "Dia 1". */
  listCompletedSessionsSince(
    userId: string,
    workoutIds: string[],
    startDayKey: string,
    assignmentId?: string,
  ): Promise<CompletedProgramSession[]>;

  /**
   * Busca em lote os dias concluídos de vários participantes/treinos (incluindo logs portados
   * via `programAssignmentId`) a partir do menor `startDayKey`, eliminando N+1.
   */
  listCompletedSessionDaysForUsers(
    userIds: string[],
    workoutIds: string[],
    minStartDayKey: string,
    assignmentIds?: string[],
  ): Promise<CompletedProgramSessionDay[]>;
}
