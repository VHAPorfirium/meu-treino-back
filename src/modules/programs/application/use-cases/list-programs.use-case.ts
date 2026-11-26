import { Inject, Injectable } from '@nestjs/common';
import { ProgramStatus } from '@prisma/client';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import { ProgramProgressService } from '../services/program-progress.service';

@Injectable()
export class ListProgramsUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
    private readonly programProgressService: ProgramProgressService,
  ) {}

  async execute(trainerId?: string) {
    const programs = await this.programRepository.listPrograms(trainerId);

    const activeAssignments = programs.flatMap((program) =>
      program.assignments
        .filter((assignment) => assignment.status === ProgramStatus.ACTIVE)
        .map((assignment) => ({ ...assignment, program })),
    );

    const progressByAssignmentId =
      await this.programProgressService.calculateForAssignments(activeAssignments);

    return programs.map((program) => ({
      ...program,
      assignments: program.assignments.map((assignment) => ({
        ...assignment,
        progress:
          assignment.status === ProgramStatus.ACTIVE
            ? (progressByAssignmentId.get(assignment.id) ?? null)
            : null,
      })),
    }));
  }
}
