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

/** Tira o aluno do programa: a participação vira histórico e os treinos saem da lista dele. */
@Injectable()
export class ArchiveProgramAssignmentUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
    @Optional()
    private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(assignmentId: string, trainerId?: string) {
    const assignment = await this.programRepository.findAssignmentById(assignmentId);
    if (!assignment) throw new NotFoundException('Participação não encontrada');
    assertProgramOwnership(assignment.program, trainerId);
    if (trainerId && ensureTrainerAccess(this.trainerAccess)) {
      await this.trainerAccess.assertActiveLink(trainerId, assignment.userId);
    }
    if (assignment.status !== ProgramStatus.ARCHIVED) {
      await this.programRepository.archiveAssignment(assignmentId);
    }
    return { ok: true };
  }
}
