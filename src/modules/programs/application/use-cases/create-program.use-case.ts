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

    const createdProgram = await this.programRepository.createProgram({
      name: createProgramDto.name.trim(),
      description: createProgramDto.description?.trim() || null,
      type: createProgramDto.type,
      targetWeeks: durationInput.targetWeeks,
      targetDays: durationInput.targetDays,
      workoutIds: Array.from(new Set(createProgramDto.workoutIds)),
    });

    if (createProgramDto.userIds.length === 0) return createdProgram;
    return this.assignProgramToUsers.execute(createdProgram.id, createProgramDto.userIds);
  }
}
