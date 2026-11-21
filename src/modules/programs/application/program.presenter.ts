import { AssignmentWithProgram } from '../domain/program.repository';
import { ProgramDurationPolicy } from '../domain/program-duration-policy';
import { ProgramProgress } from '../domain/program-progress-calculator';
import { ProgramReport } from '../domain/program-report';

/** Formato que o app do aluno recebe para o programa atual. */
export function presentCurrentProgram(
  assignment: AssignmentWithProgram,
  progress: ProgramProgress | null,
) {
  return {
    assignmentId: assignment.id,
    status: assignment.status,
    startDate: assignment.startDate.toISOString(),
    endDate: assignment.endDate?.toISOString() ?? null,
    hasDeadline: ProgramDurationPolicy.hasDeadline(assignment.program.type),
    report: (assignment.reportData as unknown as ProgramReport | null) ?? null,
    progress,
    program: {
      id: assignment.program.id,
      name: assignment.program.name,
      description: assignment.program.description,
      type: assignment.program.type,
      targetWeeks: assignment.program.targetWeeks,
      targetDays: assignment.program.targetDays,
      workouts: assignment.program.workouts,
    },
  };
}

/** Conquista exibida no perfil do aluno (programa com prazo concluído). */
export function presentAchievement(assignment: AssignmentWithProgram) {
  return {
    assignmentId: assignment.id,
    programId: assignment.program.id,
    programName: assignment.program.name,
    programType: assignment.program.type,
    completedAt: assignment.endDate?.toISOString() ?? null,
    report: assignment.reportData as unknown as ProgramReport,
  };
}
