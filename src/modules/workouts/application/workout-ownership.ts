import { ForbiddenException } from '@nestjs/common';

export function assertWorkoutOwnership(
  workout: { ownerTrainerId?: string | null },
  trainerId?: string,
): void {
  if (trainerId && workout.ownerTrainerId !== trainerId) {
    throw new ForbiddenException(
      'Você não tem permissão para acessar ou alterar este treino',
    );
  }
}
