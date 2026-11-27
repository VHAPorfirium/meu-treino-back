import { ForbiddenException } from '@nestjs/common';

export function assertProgramOwnership(
  program: { ownerTrainerId?: string | null },
  trainerId?: string,
): void {
  if (trainerId && program.ownerTrainerId !== trainerId) {
    throw new ForbiddenException(
      'Você não tem permissão para acessar ou alterar este programa',
    );
  }
}

/**
 * Remove da resposta ao personal as participações de ex-alunos (vínculo ENDED),
 * preservando-as no banco (medalhas/desafios continuam do aluno).
 */
export async function filterProgramAssignmentsToActiveTrainees<
  T extends { assignments: { userId: string }[] },
>(
  program: T | null,
  trainerId: string | undefined,
  trainerAccess: { getActiveTraineeIds(trainerId: string): Promise<string[]> } | undefined,
): Promise<T | null> {
  if (!program || !trainerId || !trainerAccess) return program;
  const activeSet = new Set(await trainerAccess.getActiveTraineeIds(trainerId));
  return {
    ...program,
    assignments: program.assignments.filter((a) => activeSet.has(a.userId)),
  };
}
