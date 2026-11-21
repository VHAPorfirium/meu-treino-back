import { Inject, Injectable } from '@nestjs/common';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import { ProgramProgressService } from '../services/program-progress.service';
import { presentCurrentProgram } from '../program.presenter';

/** Programa em que o aluno está agora (ou `null`), com o "Dia X de Y" quando houver prazo. */
@Injectable()
export class GetCurrentProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
    private readonly programProgressService: ProgramProgressService,
  ) {}

  async execute(userId: string) {
    const currentAssignment = await this.programRepository.findCurrentAssignmentByUser(userId);
    if (!currentAssignment) return null;

    const { progress } = await this.programProgressService.calculateForAssignment(currentAssignment);
    return presentCurrentProgram(currentAssignment, progress);
  }
}
