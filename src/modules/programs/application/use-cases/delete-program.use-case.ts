import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ProgramStatus } from '@prisma/client';
import {
  TrainerAccessService,
  ensureTrainerAccess,
} from '../../../links/application/trainer-access.service';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import { assertProgramOwnership } from '../program-ownership';

/**
 * Remove o programa da visão do personal.
 * Se existirem conquistas (COMPLETED ou ARCHIVED com relatório) ou participações ativas de ex-alunos
 * já desvinculados (ENDED), apenas desvincula `ownerTrainerId` (preservando medalhas e
 * desafios dos alunos em vez de destruí-los por cascade).
 */
@Injectable()
export class DeleteProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
    @Optional()
    private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(programId: string, trainerId?: string) {
    const existingProgram = await this.programRepository.findProgramById(programId);
    if (!existingProgram) throw new NotFoundException('Programa não encontrado');
    assertProgramOwnership(existingProgram, trainerId);

    // Medalha = COMPLETED ou qualquer participação com relatório gravado (inclusive
    // desafios concluídos e depois ARCHIVED, que continuam aparecendo em Conquistas).
    const hasCompletedMedals = existingProgram.assignments.some(
      (a) => a.status === ProgramStatus.COMPLETED || a.reportData != null,
    );

    let hasDetachedActiveTrainee = false;
    if (trainerId && ensureTrainerAccess(this.trainerAccess)) {
      const activeIds = new Set(
        await this.trainerAccess.getActiveTraineeIds(trainerId),
      );
      hasDetachedActiveTrainee = existingProgram.assignments.some(
        (a) => a.status === ProgramStatus.ACTIVE && !activeIds.has(a.userId),
      );
    }

    if (
      (hasCompletedMedals || hasDetachedActiveTrainee) &&
      this.programRepository.detachProgramOwner
    ) {
      await this.programRepository.detachProgramOwner(programId);
    } else {
      await this.programRepository.deleteProgram(programId);
    }
    return { ok: true };
  }
}
