import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProgramStatus } from '@prisma/client';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import { ProgramProgressService } from '../services/program-progress.service';

/** Programa + progresso de cada aluno que está participando (painel do personal). */
@Injectable()
export class GetProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
    private readonly programProgressService: ProgramProgressService,
  ) {}

  async execute(programId: string) {
    const program = await this.programRepository.findProgramById(programId);
    if (!program) throw new NotFoundException('Programa não encontrado');

    const activeAssignments = program.assignments
      .filter((assignment) => assignment.status === ProgramStatus.ACTIVE)
      .map((assignment) => ({ ...assignment, program }));

    const progressByAssignmentId =
      await this.programProgressService.calculateForAssignments(activeAssignments);

    const assignmentsWithProgress = program.assignments.map((assignment) => ({
      ...assignment,
      progress:
        assignment.status === ProgramStatus.ACTIVE
          ? (progressByAssignmentId.get(assignment.id) ?? null)
          : null,
    }));

    return { ...program, assignments: assignmentsWithProgress };
  }
}
