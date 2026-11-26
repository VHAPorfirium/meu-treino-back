import { ForbiddenException } from '@nestjs/common';
import { ProgramStatus, ProgramType } from '@prisma/client';
import { ProgramProgressService } from '../../programs/application/services/program-progress.service';
import {
  AssignmentWithProgram,
  ProgramRepository,
} from '../../programs/domain/program.repository';
import { DeleteProgramUseCase } from '../../programs/application/use-cases/delete-program.use-case';
import { UpdateWorkoutUseCase } from './use-cases/update-workout.use-case';
import { WorkoutRepository } from '../domain/workout.repository';

describe('Isolamento multi-tenant de treinos e programas + continuidade de desafio', () => {
  it('bloqueia Personal B ao tentar editar treino de Personal A (403)', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: 'w-a',
        name: 'Treino A',
        ownerTrainerId: 'personal-a',
      }),
      update: jest.fn(),
    } as unknown as WorkoutRepository;

    const useCase = new UpdateWorkoutUseCase(repo);
    await expect(
      useCase.execute('w-a', { name: 'Hack' }, 'personal-b'),
    ).rejects.toThrow(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('bloqueia Personal B ao tentar excluir programa de Personal A (403)', async () => {
    const repo = {
      findProgramById: jest.fn().mockResolvedValue({
        id: 'p-a',
        ownerTrainerId: 'personal-a',
      }),
      deleteProgram: jest.fn(),
    } as unknown as ProgramRepository;

    const useCase = new DeleteProgramUseCase(repo);
    await expect(useCase.execute('p-a', 'personal-b')).rejects.toThrow(
      ForbiddenException,
    );
    expect(repo.deleteProgram).not.toHaveBeenCalled();
  });

  it('preserva contagem de dias do desafio após Copy-on-Transfer usando programAssignmentId', async () => {
    const assignment: AssignmentWithProgram = {
      id: 'pa-12',
      programId: 'prog-b-clone',
      userId: 'u-aluna',
      startDayKey: '2026-11-01',
      startDate: new Date('2026-11-01T12:00:00Z'),
      endDate: null,
      status: ProgramStatus.ACTIVE,
      reportData: null,
      createdAt: new Date(),
      program: {
        id: 'prog-b-clone',
        name: 'Desafio 30 Dias',
        description: null,
        type: ProgramType.CHALLENGE,
        targetWeeks: null,
        targetDays: 30,
        ownerTrainerId: 'personal-b',
        clonedFromId: 'prog-a',
        createdAt: new Date(),
        updatedAt: new Date(),
        // Treino novo clonado com ID diferente do treino antigo!
        workouts: [{ id: 'w-b-clone', name: 'Treino A', dayOfWeek: 1, active: true }],
      },
    };

    const repo = {
      listCompletedSessionDaysForUsers: jest.fn().mockResolvedValue([
        // Log antigo (treino do Personal A), mantido via programAssignmentId = 'pa-12'
        { userId: 'u-aluna', workoutId: 'w-a-old', dayKey: '2026-11-02', programAssignmentId: 'pa-12' },
        // Log novo (treino clonado do Personal B)
        { userId: 'u-aluna', workoutId: 'w-b-clone', dayKey: '2026-11-12', programAssignmentId: 'pa-12' },
      ]),
    } as unknown as ProgramRepository;

    const service = new ProgramProgressService(repo);
    const map = await service.calculateForAssignments([assignment], '2026-11-12');
    const progress = map.get('pa-12');

    expect(progress?.currentDayNumber).toBe(12);
    expect(progress?.completedWorkoutsCount).toBe(2);
    expect(progress?.trainedDaysCount).toBe(2);
    expect(repo.listCompletedSessionDaysForUsers).toHaveBeenCalledWith(
      ['u-aluna'],
      ['w-b-clone'],
      '2026-11-01',
      ['pa-12'],
    );
  });
});
