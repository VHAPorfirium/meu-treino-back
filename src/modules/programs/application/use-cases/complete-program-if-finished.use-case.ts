import { Inject, Injectable } from '@nestjs/common';
import { ProgramStatus } from '@prisma/client';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import { ProgramReport } from '../../domain/program-report';
import { calculateLoadEvolutionPercentage } from '../../domain/load-evolution-calculator';
import { ProgramProgressService } from '../services/program-progress.service';

export interface ProgramCompletionResult {
  programCompleted: boolean;
  report: ProgramReport | null;
}

const NOT_COMPLETED: ProgramCompletionResult = { programCompleted: false, report: null };

/**
 * Chamado sempre que o aluno finaliza um treino. Se o treino é de um programa
 * com prazo e o último dia já chegou, encerra a jornada e grava o relatório.
 * O treino contínuo nunca é encerrado por aqui.
 */
@Injectable()
export class CompleteProgramIfFinishedUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
    private readonly programProgressService: ProgramProgressService,
  ) {}

  async execute(
    userId: string,
    completedWorkoutId: string,
    sessionProgramAssignmentId?: string | null,
  ): Promise<ProgramCompletionResult> {
    const currentAssignment = await this.programRepository.findCurrentAssignmentByUser(userId);
    if (!currentAssignment || currentAssignment.status !== ProgramStatus.ACTIVE) return NOT_COMPLETED;

    // A sessão conta para o programa se o treino pertence a ele OU se ela foi aberta
    // já vinculada a esta participação (ex.: sessão aberta antes de uma transferência
    // de personal, cujo treino original agora pertence ao programa antigo).
    const workoutBelongsToProgram =
      sessionProgramAssignmentId === currentAssignment.id ||
      currentAssignment.program.workouts.some((workout) => workout.id === completedWorkoutId);
    if (!workoutBelongsToProgram) return NOT_COMPLETED;

    const { progress, completedSessions } =
      await this.programProgressService.calculateForAssignment(currentAssignment);
    if (!progress || !progress.isLastDayReached) return NOT_COMPLETED;

    const programReport: ProgramReport = {
      programName: currentAssignment.program.name,
      programType: currentAssignment.program.type,
      totalDays: progress.totalDays,
      trainedDaysCount: progress.trainedDaysCount,
      completedWorkoutsCount: progress.completedWorkoutsCount,
      loadEvolutionPercentage: calculateLoadEvolutionPercentage(completedSessions),
      completedAt: new Date().toISOString(),
    };

    // Transição condicional ACTIVE → COMPLETED (com lock no aluno): se uma atribuição/
    // arquivamento concorrente ou um replay offline duplicado chegou antes, não
    // sobrescreve o estado atual nem gera relatório duplicado.
    const transitioned = await this.programRepository.markAssignmentCompleted(
      currentAssignment.id,
      programReport,
    );
    if (!transitioned) return NOT_COMPLETED;
    return { programCompleted: true, report: programReport };
  }
}
