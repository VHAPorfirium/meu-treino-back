import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProgramStatus } from '@prisma/client';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';

/** Tira o aluno do programa: a participação vira histórico e os treinos saem da lista dele. */
@Injectable()
export class ArchiveProgramAssignmentUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
  ) {}

  async execute(assignmentId: string) {
    const assignment = await this.programRepository.findAssignmentById(assignmentId);
    if (!assignment) throw new NotFoundException('Participação não encontrada');
    if (assignment.status !== ProgramStatus.ARCHIVED) {
      await this.programRepository.archiveAssignment(assignmentId);
    }
    return { ok: true };
  }
}
