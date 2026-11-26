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
