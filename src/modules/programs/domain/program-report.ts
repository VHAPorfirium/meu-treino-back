import { ProgramType } from '@prisma/client';

/** Relatório gravado em `ProgramAssignment.reportData` quando a jornada termina. */
export interface ProgramReport {
  programName: string;
  programType: ProgramType;
  totalDays: number;
  trainedDaysCount: number;
  completedWorkoutsCount: number;
  /** Média de evolução de carga em %, ou `null` sem base de comparação. */
  loadEvolutionPercentage: number | null;
  completedAt: string;
}
