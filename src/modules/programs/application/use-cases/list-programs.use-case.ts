import { Inject, Injectable } from '@nestjs/common';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';

@Injectable()
export class ListProgramsUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
  ) {}

  execute() {
    return this.programRepository.listPrograms();
  }
}
