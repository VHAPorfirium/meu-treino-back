import { UpdateProgramUseCase } from './update-program.use-case';
import { ProgramRepository } from '../../domain/program.repository';

describe('UpdateProgramUseCase — escopo de ex-alunos', () => {
  it('repassa allowedUserIds ao repositório e oculta ex-alunos na resposta', async () => {
    const programRepository = {
      findProgramById: jest.fn().mockResolvedValue({ id: 'prog-1', ownerTrainerId: 'personal-1' }),
      findExistingWorkoutIds: jest.fn().mockResolvedValue(['w-1']),
      updateProgram: jest.fn().mockResolvedValue({
        id: 'prog-1',
        assignments: [{ userId: 'aluna-ativa' }, { userId: 'ex-aluna' }],
      }),
    } as unknown as jest.Mocked<ProgramRepository>;
    const trainerAccess = { getActiveTraineeIds: jest.fn().mockResolvedValue(['aluna-ativa']) };

    const useCase = new UpdateProgramUseCase(programRepository, trainerAccess as never);
    const result = await useCase.execute('prog-1', { name: ' Novo ', workoutIds: ['w-1'] }, 'personal-1');

    expect(programRepository.updateProgram).toHaveBeenCalledWith('prog-1', {
      name: 'Novo',
      description: undefined,
      workoutIds: ['w-1'],
      allowedUserIds: ['aluna-ativa'],
    });
    expect(result.assignments).toEqual([{ userId: 'aluna-ativa' }]);
  });

  it('não envia allowedUserIds quando não há troca de treinos', async () => {
    const programRepository = {
      findProgramById: jest.fn().mockResolvedValue({ id: 'prog-1', ownerTrainerId: 'personal-1' }),
      updateProgram: jest.fn().mockResolvedValue({ id: 'prog-1', assignments: [] }),
    } as unknown as jest.Mocked<ProgramRepository>;
    const trainerAccess = { getActiveTraineeIds: jest.fn().mockResolvedValue([]) };

    await new UpdateProgramUseCase(programRepository, trainerAccess as never).execute(
      'prog-1',
      { name: 'X' },
      'personal-1',
    );
    expect(programRepository.updateProgram.mock.calls[0][1].allowedUserIds).toBeUndefined();
  });
});
