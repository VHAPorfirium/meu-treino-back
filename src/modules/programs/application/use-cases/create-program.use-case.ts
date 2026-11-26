import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import {
  InvalidProgramDurationError,
  ProgramDurationPolicy,
} from '../../domain/program-duration-policy';
import { CreateProgramDto } from '../dto/create-program.dto';
import { AssignProgramToUsersUseCase } from './assign-program-to-users.use-case';

@Injectable()
export class CreateProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
    private readonly assignProgramToUsers: AssignProgramToUsersUseCase,
  ) {}

  async execute(createProgramDto: CreateProgramDto) {
    const durationInput = {
      programType: createProgramDto.type,
      targetWeeks: createProgramDto.targetWeeks ?? null,
      targetDays: createProgramDto.targetDays ?? null,
    };
    try {
      ProgramDurationPolicy.validate(durationInput);
    } catch (error) {
      if (error instanceof InvalidProgramDurationError) throw new BadRequestException(error.message);
      throw error;
    }

    const uniqueWorkoutIds = Array.from(new Set(createProgramDto.workoutIds));
    const uniqueUserIds = Array.from(new Set(createProgramDto.userIds));

    // Valida treinos e alunos ANTES de gravar para nunca deixar programa/vínculos pela metade.
    if (uniqueWorkoutIds.length > 0) {
      const existingWorkoutIds = new Set(
        await this.programRepository.findExistingWorkoutIds(uniqueWorkoutIds),
      );
      const missingWorkoutIds = uniqueWorkoutIds.filter((id) => !existingWorkoutIds.has(id));
      if (missingWorkoutIds.length > 0) {
        throw new BadRequestException(
          'Treinos não encontrados: ' + missingWorkoutIds.join(', '),
        );
      }
    }
    await this.assignProgramToUsers.ensureAllAreTrainees(uniqueUserIds);

    const createdProgram = await this.programRepository.createProgram({
      name: createProgramDto.name.trim(),
      description: createProgramDto.description?.trim() || null,
      type: createProgramDto.type,
      targetWeeks: durationInput.targetWeeks,
      targetDays: durationInput.targetDays,
      workoutIds: uniqueWorkoutIds,
    });

    if (uniqueUserIds.length === 0) return createdProgram;
    return this.assignProgramToUsers.execute(createdProgram.id, uniqueUserIds);
  }
}
