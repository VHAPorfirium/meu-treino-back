import { Inject, Injectable } from '@nestjs/common';
import {
  AssignmentWithProgram,
  CompletedProgramSession,
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import { ProgramDurationPolicy } from '../../domain/program-duration-policy';
import {
  calculateProgramProgress,
  ProgramProgress,
} from '../../domain/program-progress-calculator';
import { diaLocal } from '../../../../shared/time/dia-local';

export interface AssignmentProgressResult {
  /** `null` no treino contínuo: não existe "Dia X de Y". */
  progress: ProgramProgress | null;
  completedSessions: CompletedProgramSession[];
}

/** Junta os dados do banco com as regras puras de progresso do domínio. */
@Injectable()
export class ProgramProgressService {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
  ) {}

  async calculateForAssignment(
    assignment: AssignmentWithProgram,
    todayDayKey: string = diaLocal(),
  ): Promise<AssignmentProgressResult> {
    const totalDays = ProgramDurationPolicy.calculateTotalDays({
      programType: assignment.program.type,
      targetWeeks: assignment.program.targetWeeks,
      targetDays: assignment.program.targetDays,
    });
    if (totalDays === null) return { progress: null, completedSessions: [] };

    const completedSessions = await this.programRepository.listCompletedSessionsSince(
      assignment.userId,
      assignment.program.workouts.map((workout) => workout.id),
      assignment.startDayKey,
    );

    const progress = calculateProgramProgress({
      startDayKey: assignment.startDayKey,
      todayDayKey,
      totalDays,
      completedSessions,
    });

    return { progress, completedSessions };
  }
}
