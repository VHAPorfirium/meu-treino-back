import { Role } from '@prisma/client';
import { WorkoutRepository } from '../../domain/workout.repository';
import { UserRepository } from '../../../users/domain/user.repository';
import { ListWorkoutsUseCase } from './list-workouts.use-case';
import { GetWorkoutUseCase } from './get-workout.use-case';
import { SetAssigneesUseCase } from './set-assignees.use-case';
import { DeleteWorkoutUseCase } from './delete-workout.use-case';

const trainerAccess = {
  getActiveTraineeIds: jest.fn().mockResolvedValue(['aluna-ativa']),
  assertAllActiveLinks: jest.fn().mockResolvedValue(undefined),
};

describe('Isolamento de ex-alunos (vínculo ENDED) em Treinos', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ListWorkoutsUseCase oculta ex-alunos dos assignees', async () => {
    const repo = {
      listAll: jest.fn().mockResolvedValue([
        { id: 'w1', assignees: [{ id: 'aluna-ativa', name: 'Ana' }, { id: 'ex-aluna', name: 'Bia' }] },
      ]),
    } as unknown as WorkoutRepository;
    const result = await new ListWorkoutsUseCase(repo, trainerAccess as never).execute('personal-1');
    expect(result[0].assignees).toEqual([{ id: 'aluna-ativa', name: 'Ana' }]);
  });

  it('GetWorkoutUseCase oculta ex-alunos dos assignees', async () => {
    const repo = {
      findByIdWithExercises: jest.fn().mockResolvedValue({
        id: 'w1',
        ownerTrainerId: 'personal-1',
        assignments: [
          { userId: 'aluna-ativa', user: { id: 'aluna-ativa', name: 'Ana' } },
          { userId: 'ex-aluna', user: { id: 'ex-aluna', name: 'Bia' } },
        ],
      }),
    } as unknown as WorkoutRepository;
    const result = await new GetWorkoutUseCase(repo, trainerAccess as never).execute('w1', 'personal-1');
    expect(result.assignees).toEqual([{ id: 'aluna-ativa', name: 'Ana' }]);
  });

  it('SetAssigneesUseCase só remove atribuições dentro do escopo ativo (preserva ex-aluna)', async () => {
    const repo = {
      findByIdWithExercises: jest.fn().mockResolvedValue({
        id: 'w1',
        name: 'Perna',
        ownerTrainerId: 'personal-1',
        assignments: [{ userId: 'aluna-ativa' }, { userId: 'ex-aluna' }],
      }),
      setAssignees: jest.fn().mockResolvedValue([{ id: 'ex-aluna', name: 'Bia' }]),
    } as unknown as jest.Mocked<WorkoutRepository>;
    const users = {
      findRolesByIds: jest.fn(),
    } as unknown as UserRepository;
    const push = { notifyUsers: jest.fn() };
    const useCase = new SetAssigneesUseCase(repo, users, push as never, trainerAccess as never);

    const result = await useCase.execute('w1', { userIds: [] }, 'personal-1');

    expect(repo.setAssignees).toHaveBeenCalledWith('w1', [], ['aluna-ativa']);
    expect(result.assignees).toEqual([]);
    expect(users.findRolesByIds).not.toHaveBeenCalled();
  });

  it('SetAssigneesUseCase valida papéis sem carregar a tabela inteira de usuários', async () => {
    const repo = {
      findByIdWithExercises: jest.fn().mockResolvedValue({
        id: 'w1',
        name: 'Perna',
        ownerTrainerId: 'personal-1',
        assignments: [],
      }),
      setAssignees: jest.fn(),
    } as unknown as jest.Mocked<WorkoutRepository>;
    const users = {
      findAll: jest.fn(),
      findRolesByIds: jest.fn().mockResolvedValue([{ id: 'u-admin', role: Role.ADMIN }]),
    } as unknown as jest.Mocked<UserRepository>;
    const useCase = new SetAssigneesUseCase(repo, users, { notifyUsers: jest.fn() } as never, trainerAccess as never);

    await expect(useCase.execute('w1', { userIds: ['u-admin'] }, 'personal-1')).rejects.toThrow(
      'Só alunos (TRAINEE)',
    );
    expect(users.findAll).not.toHaveBeenCalled();
    expect(repo.setAssignees).not.toHaveBeenCalled();
  });

  it('DeleteWorkoutUseCase apenas desvincula o dono quando o treino ainda é de uma ex-aluna', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({ id: 'w1', ownerTrainerId: 'personal-1' }),
      countLogs: jest.fn().mockResolvedValue(0),
      listAssigneeIds: jest.fn().mockResolvedValue(['ex-aluna']),
      detachOwner: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn(),
    } as unknown as jest.Mocked<WorkoutRepository>;

    const result = await new DeleteWorkoutUseCase(repo, trainerAccess as never).execute('w1', 'personal-1');

    expect(result).toEqual({ ok: true, detached: true });
    expect(repo.detachOwner).toHaveBeenCalledWith('w1');
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('DeleteWorkoutUseCase apaga normalmente quando só há alunos ativos', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({ id: 'w1', ownerTrainerId: 'personal-1' }),
      countLogs: jest.fn().mockResolvedValue(0),
      listAssigneeIds: jest.fn().mockResolvedValue(['aluna-ativa']),
      detachOwner: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WorkoutRepository>;

    await new DeleteWorkoutUseCase(repo, trainerAccess as never).execute('w1', 'personal-1');
    expect(repo.delete).toHaveBeenCalledWith('w1');
    expect(repo.detachOwner).not.toHaveBeenCalled();
  });
});
