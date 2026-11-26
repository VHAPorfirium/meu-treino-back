import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import { UpdateProgramDto } from '../dto/update-program.dto';
import { assertProgramOwnership } from '../program-ownership';

@Injectable()
export class UpdateProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
  ) {}

  async execute(
    programId: string,
    updateProgramDto: UpdateProgramDto,
    trainerId?: string,
  ) {
    const existingProgram = await this.programRepository.findProgramById(programId);
    if (!existingProgram) throw new NotFoundException('Programa não encontrado');
    assertProgramOwnership(existingProgram, trainerId);

    const uniqueWorkoutIds = updateProgramDto.workoutIds
      ? Array.from(new Set(updateProgramDto.workoutIds))
      : undefined;

    if (uniqueWorkoutIds && uniqueWorkoutIds.length > 0) {
      const existingIds = new Set(
        await this.programRepository.findExistingWorkoutIds(
          uniqueWorkoutIds,
          trainerId,
        ),
      );
      const missingIds = uniqueWorkoutIds.filter((id) => !existingIds.has(id));
      if (missingIds.length > 0) {
        throw new BadRequestException(
          'Treinos não encontrados: ' + missingIds.join(', '),
        );
      }
    }

    return this.programRepository.updateProgram(programId, {
      name: updateProgramDto.name?.trim(),
      description:
        updateProgramDto.description === undefined
          ? undefined
          : updateProgramDto.description?.trim() || null,
      workoutIds: uniqueWorkoutIds,
    });
  }
}
