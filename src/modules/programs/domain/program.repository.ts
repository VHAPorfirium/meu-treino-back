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
}

export interface UpdateProgramData {
  name?: string;
  description?: string | null;
  workoutIds?: string[];
}

export interface CompletedProgramSession extends SessionLoadRecords {
  dayKey: string;
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

  findProgramById(programId: string): Promise<ProgramWithDetails | null>;

  listPrograms(): Promise<ProgramWithDetails[]>;

  /** Retorna os IDs existentes dentre os `workoutIds` informados. */
  findExistingWorkoutIds(workoutIds: string[]): Promise<string[]>;

  /** Participação atual do aluno (ACTIVE ou COMPLETED ainda não arquivada). */
  findCurrentAssignmentByUser(userId: string): Promise<AssignmentWithProgram | null>;

  findAssignmentById(assignmentId: string): Promise<AssignmentWithProgram | null>;

  listCompletedAssignmentsByUser(userId: string): Promise<AssignmentWithProgram[]>;

  /** Cria as participações e direciona os treinos do programa aos alunos, numa transação. */
  assignProgramToUsers(programId: string, userIds: string[], startDayKey: string): Promise<void>;

  /** Arquiva a participação e retira do aluno os treinos daquele programa, numa transação. */
  archiveAssignment(assignmentId: string): Promise<void>;

  markAssignmentCompleted(assignmentId: string, programReport: ProgramReport): Promise<void>;

  /** Sessões concluídas pelo aluno nos treinos do programa desde o "Dia 1", em ordem cronológica. */
  listCompletedSessionsSince(
    userId: string,
    workoutIds: string[],
    startDayKey: string,
  ): Promise<CompletedProgramSession[]>;
}
