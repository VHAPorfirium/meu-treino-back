import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';

/** Remove só o agrupamento: os treinos continuam existindo e direcionados. */
@Injectable()
export class DeleteProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
  ) {}

  async execute(programId: string) {
    const existingProgram = await this.programRepository.findProgramById(programId);
    if (!existingProgram) throw new NotFoundException('Programa não encontrado');
    await this.programRepository.deleteProgram(programId);
    return { ok: true };
  }
}
