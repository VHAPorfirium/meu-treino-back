import { Inject, Injectable, Optional } from '@nestjs/common';
import { ProgramStatus } from '@prisma/client';
import { TrainerAccessService } from '../../../links/application/trainer-access.service';
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
    @Optional()
    private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(trainerId?: string) {
    const [rawPrograms, allowedTraineeIds] = await Promise.all([
      this.programRepository.listPrograms(trainerId),
      trainerId && this.trainerAccess
        ? this.trainerAccess.getActiveTraineeIds(trainerId)
        : Promise.resolve(null),
    ]);

    const allowedSet = allowedTraineeIds ? new Set(allowedTraineeIds) : null;
    const programs = allowedSet
      ? rawPrograms.map((p) => ({
          ...p,
          assignments: p.assignments.filter((a) => allowedSet.has(a.userId)),
        }))
      : rawPrograms;

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
