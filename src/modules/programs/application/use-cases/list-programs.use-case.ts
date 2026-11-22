import { Inject, Injectable } from '@nestjs/common';
import { ProgramStatus } from '@prisma/client';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import { ProgramProgressService } from '../services/program-progress.service';

/** Programas com o progresso de quem está participando (cards e dashboard). */
@Injectable()
export class ListProgramsUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
    private readonly programProgressService: ProgramProgressService,
  ) {}

  async execute() {
    const programs = await this.programRepository.listPrograms();
    return Promise.all(
      programs.map(async (program) => ({
        ...program,
        assignments: await Promise.all(
          program.assignments.map(async (assignment) => {
            if (assignment.status !== ProgramStatus.ACTIVE) return { ...assignment, progress: null };
            const { progress } = await this.programProgressService.calculateForAssignment({
              ...assignment,
              program,
            });
            return { ...assignment, progress };
          }),
        ),
      })),
    );
  }
}
