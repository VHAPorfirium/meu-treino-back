import { Inject, Injectable } from '@nestjs/common';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import { presentAchievement } from '../program.presenter';

/** Medalhas do aluno: cada mesociclo ou desafio concluído com relatório. */
@Injectable()
export class ListMyAchievementsUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
  ) {}

  async execute(userId: string) {
    const completedAssignments = await this.programRepository.listCompletedAssignmentsByUser(userId);
    return completedAssignments.map(presentAchievement);
  }
}
