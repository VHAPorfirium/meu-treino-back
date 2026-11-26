import { BadRequestException } from '@nestjs/common';
import { ProgramType } from '@prisma/client';
import { ProgramRepository } from '../../domain/program.repository';
import { AssignProgramToUsersUseCase } from './assign-program-to-users.use-case';
import { CreateProgramUseCase } from './create-program.use-case';

describe('CreateProgramUseCase — validação prévia à persistência', () => {
  it('não persiste programa quando userIds contém usuário inválido', async () => {
    const repo = {
      findExistingWorkoutIds: jest.fn().mockResolvedValue(['w1']),
      createProgram: jest.fn(),
    } as unknown as jest.Mocked<ProgramRepository>;
    const assign = {
      ensureAllAreTrainees: jest.fn().mockRejectedValue(new BadRequestException('usuário inválido')),
      execute: jest.fn(),
    } as unknown as jest.Mocked<AssignProgramToUsersUseCase>;

    const useCase = new CreateProgramUseCase(repo, assign);
    await expect(
      useCase.execute({
        name: 'Desafio 30d',
        type: ProgramType.CHALLENGE,
        targetDays: 30,
        workoutIds: ['w1'],
        userIds: ['admin-ou-inexistente'],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(repo.createProgram).not.toHaveBeenCalled();
  });

  it('não persiste programa quando workoutIds contém treino inexistente', async () => {
    const repo = {
      findExistingWorkoutIds: jest.fn().mockResolvedValue(['w1']),
      createProgram: jest.fn(),
    } as unknown as jest.Mocked<ProgramRepository>;
    const assign = {
      ensureAllAreTrainees: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn(),
    } as unknown as jest.Mocked<AssignProgramToUsersUseCase>;

    const useCase = new CreateProgramUseCase(repo, assign);
    await expect(
      useCase.execute({
        name: 'Desafio 30d',
        type: ProgramType.CHALLENGE,
        targetDays: 30,
        workoutIds: ['w1', 'w-inexistente'],
        userIds: [],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(repo.createProgram).not.toHaveBeenCalled();
  });
});
