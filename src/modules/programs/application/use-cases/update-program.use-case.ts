import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import { UpdateProgramDto } from '../dto/update-program.dto';

@Injectable()
export class UpdateProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
  ) {}

  async execute(programId: string, updateProgramDto: UpdateProgramDto) {
    const existingProgram = await this.programRepository.findProgramById(programId);
    if (!existingProgram) throw new NotFoundException('Programa não encontrado');

    return this.programRepository.updateProgram(programId, {
      name: updateProgramDto.name?.trim(),
      description:
        updateProgramDto.description === undefined
          ? undefined
          : updateProgramDto.description?.trim() || null,
      workoutIds: updateProgramDto.workoutIds
        ? Array.from(new Set(updateProgramDto.workoutIds))
        : undefined,
    });
  }
}
