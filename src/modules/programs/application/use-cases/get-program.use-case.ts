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

    const assignmentsWithProgress = await Promise.all(
      program.assignments.map(async (assignment) => {
        if (assignment.status !== ProgramStatus.ACTIVE) return { ...assignment, progress: null };
        const { progress } = await this.programProgressService.calculateForAssignment({
          ...assignment,
          program: { ...program, workouts: program.workouts },
        });
        return { ...assignment, progress };
      }),
    );

    return { ...program, assignments: assignmentsWithProgress };
  }
}
