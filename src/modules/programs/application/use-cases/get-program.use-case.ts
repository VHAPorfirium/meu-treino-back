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
import { ProgramProgressService } from '../services/program-progress.service';
import { assertProgramOwnership } from '../program-ownership';

/** Programa + progresso de cada aluno atualmente vinculado (painel do personal). */
@Injectable()
export class GetProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
    private readonly programProgressService: ProgramProgressService,
    @Optional()
    private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(programId: string, trainerId?: string) {
    const program = await this.programRepository.findProgramById(programId);
    if (!program) throw new NotFoundException('Programa não encontrado');
    assertProgramOwnership(program, trainerId);

    const allowedSet =
      trainerId && ensureTrainerAccess(this.trainerAccess)
        ? new Set(await this.trainerAccess.getActiveTraineeIds(trainerId))
        : null;
    const visibleAssignments = allowedSet
      ? program.assignments.filter((a) => allowedSet.has(a.userId))
      : program.assignments;

    const activeAssignments = visibleAssignments
      .filter((assignment) => assignment.status === ProgramStatus.ACTIVE)
      .map((assignment) => ({ ...assignment, program }));

    const progressByAssignmentId =
      await this.programProgressService.calculateForAssignments(activeAssignments);

    const assignmentsWithProgress = visibleAssignments.map((assignment) => ({
      ...assignment,
      progress:
        assignment.status === ProgramStatus.ACTIVE
          ? (progressByAssignmentId.get(assignment.id) ?? null)
          : null,
    }));

    return { ...program, assignments: assignmentsWithProgress };
  }
}
