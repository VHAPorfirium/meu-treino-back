import { ProgramStatus } from '@prisma/client';
import { DeleteProgramUseCase } from './delete-program.use-case';
import { ProgramRepository } from '../../domain/program.repository';
import { TrainerAccessService } from '../../../links/application/trainer-access.service';

function buildProgram(assignments: Array<{ userId: string; status: ProgramStatus; reportData: unknown }>) {
  return {
    id: 'prog-1',
    ownerTrainerId: 'personal-1',
    assignments,
  };
}

function build(program: ReturnType<typeof buildProgram>, activeIds: string[] = []) {
  const programRepository = {
    findProgramById: jest.fn().mockResolvedValue(program),
    deleteProgram: jest.fn().mockResolvedValue(undefined),
    detachProgramOwner: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ProgramRepository>;
  const trainerAccess = {
    getActiveTraineeIds: jest.fn().mockResolvedValue(activeIds),
  } as unknown as TrainerAccessService;
  return { programRepository, useCase: new DeleteProgramUseCase(programRepository, trainerAccess) };
}

describe('DeleteProgramUseCase — preservação de medalhas', () => {
  it('apenas desvincula quando há desafio concluído e depois ARQUIVADO (reportData preservado)', async () => {
    const { useCase, programRepository } = build(
      buildProgram([{ userId: 'aluna-1', status: ProgramStatus.ARCHIVED, reportData: { totalDays: 30 } }]),
      ['aluna-1'],
    );
    await useCase.execute('prog-1', 'personal-1');
    expect(programRepository.detachProgramOwner).toHaveBeenCalledWith('prog-1');
    expect(programRepository.deleteProgram).not.toHaveBeenCalled();
  });

  it('apenas desvincula quando há participação COMPLETED', async () => {
    const { useCase, programRepository } = build(
      buildProgram([{ userId: 'aluna-1', status: ProgramStatus.COMPLETED, reportData: { totalDays: 30 } }]),
      ['aluna-1'],
    );
    await useCase.execute('prog-1', 'personal-1');
    expect(programRepository.detachProgramOwner).toHaveBeenCalled();
  });

  it('apaga de fato quando só há participações arquivadas sem relatório', async () => {
    const { useCase, programRepository } = build(
      buildProgram([{ userId: 'aluna-1', status: ProgramStatus.ARCHIVED, reportData: null }]),
      ['aluna-1'],
    );
    await useCase.execute('prog-1', 'personal-1');
    expect(programRepository.deleteProgram).toHaveBeenCalledWith('prog-1');
    expect(programRepository.detachProgramOwner).not.toHaveBeenCalled();
  });
});
