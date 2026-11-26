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
      assignment.id,
    );

    const progress = calculateProgramProgress({
      startDayKey: assignment.startDayKey,
      todayDayKey,
      totalDays,
      completedSessions,
    });

    return { progress, completedSessions };
  }

  /**
   * Calcula o progresso de várias participações com no máximo 1 consulta ao banco,
   * preservando logs de desafios portados via `programAssignmentId`.
   */
  async calculateForAssignments(
    assignments: AssignmentWithProgram[],
    todayDayKey: string = diaLocal(),
  ): Promise<Map<string, ProgramProgress | null>> {
    const progressByAssignmentId = new Map<string, ProgramProgress | null>();
    if (assignments.length === 0) return progressByAssignmentId;

    const tracked: { assignment: AssignmentWithProgram; totalDays: number; workoutIds: Set<string> }[] = [];
    const allUserIds = new Set<string>();
    const allWorkoutIds = new Set<string>();
    const allAssignmentIds: string[] = [];
    let minStartDayKey: string | null = null;

    for (const assignment of assignments) {
      const totalDays = ProgramDurationPolicy.calculateTotalDays({
        programType: assignment.program.type,
        targetWeeks: assignment.program.targetWeeks,
        targetDays: assignment.program.targetDays,
      });
      if (totalDays === null) {
        progressByAssignmentId.set(assignment.id, null);
        continue;
      }

      const workoutIds = new Set(assignment.program.workouts.map((w) => w.id));
      tracked.push({ assignment, totalDays, workoutIds });
      allUserIds.add(assignment.userId);
      allAssignmentIds.push(assignment.id);
      for (const wid of workoutIds) allWorkoutIds.add(wid);
      if (minStartDayKey === null || assignment.startDayKey < minStartDayKey) {
        minStartDayKey = assignment.startDayKey;
      }
    }

    const sessions =
      allUserIds.size > 0 && minStartDayKey !== null
        ? await this.programRepository.listCompletedSessionDaysForUsers(
            [...allUserIds],
            [...allWorkoutIds],
            minStartDayKey,
            allAssignmentIds,
          )
        : [];

    const sessionsByUser = new Map<
      string,
      { workoutId: string; dayKey: string; programAssignmentId?: string | null }[]
    >();
    for (const session of sessions) {
      const list = sessionsByUser.get(session.userId) ?? [];
      list.push(session);
      sessionsByUser.set(session.userId, list);
    }

    for (const { assignment, totalDays, workoutIds } of tracked) {
      const userSessions = sessionsByUser.get(assignment.userId) ?? [];
      const matchingSessions = userSessions.filter(
        (s) =>
          s.dayKey >= assignment.startDayKey &&
          (s.programAssignmentId === assignment.id || workoutIds.has(s.workoutId)),
      );
      progressByAssignmentId.set(
        assignment.id,
        calculateProgramProgress({
          startDayKey: assignment.startDayKey,
          todayDayKey,
          totalDays,
          completedSessions: matchingSessions,
        }),
      );
    }

    return progressByAssignmentId;
  }
}
