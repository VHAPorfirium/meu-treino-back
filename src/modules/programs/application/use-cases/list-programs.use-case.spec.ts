import { ProgramStatus, ProgramType } from '@prisma/client';
import { ProgramRepository, ProgramWithDetails } from '../../domain/program.repository';
import { ProgramProgressService } from '../services/program-progress.service';
import { ListProgramsUseCase } from './list-programs.use-case';

describe('ListProgramsUseCase — cálculo de progresso em lote (sem N+1)', () => {
  it('calcula progresso de múltiplos programas e participantes em uma única query', async () => {
    const programs: ProgramWithDetails[] = [
      {
        id: 'prog-1',
        name: 'Desafio 30 Dias',
        description: null,
        type: ProgramType.CHALLENGE,
        targetWeeks: null,
        targetDays: 30,
        ownerTrainerId: null,
        clonedFromId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        workouts: [{ id: 'w1', name: 'Treino A', dayOfWeek: 1, active: true }],
        assignments: [
          {
            id: 'a1',
            programId: 'prog-1',
            userId: 'u1',
            startDayKey: '2026-11-01',
            startDate: new Date('2026-11-01T12:00:00Z'),
            endDate: null,
            status: ProgramStatus.ACTIVE,
            reportData: null,
            createdAt: new Date(),
            user: { id: 'u1', name: 'Victor' },
          },
          {
            id: 'a2',
            programId: 'prog-1',
            userId: 'u2',
            startDayKey: '2026-11-10',
            startDate: new Date('2026-11-10T12:00:00Z'),
            endDate: null,
            status: ProgramStatus.ACTIVE,
            reportData: null,
            createdAt: new Date(),
            user: { id: 'u2', name: 'Ninfa' },
          },
          {
            id: 'a3',
            programId: 'prog-1',
            userId: 'u3',
            startDayKey: '2026-10-01',
            startDate: new Date('2026-10-01T12:00:00Z'),
            endDate: new Date('2026-10-31T12:00:00Z'),
            status: ProgramStatus.COMPLETED,
            reportData: null,
            createdAt: new Date(),
            user: { id: 'u3', name: 'Concluída' },
          },
        ],
      },
      {
        id: 'prog-2',
        name: 'Contínuo',
        description: null,
        type: ProgramType.CONTINUOUS,
        targetWeeks: null,
        targetDays: null,
        ownerTrainerId: null,
        clonedFromId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        workouts: [{ id: 'w2', name: 'Treino B', dayOfWeek: 2, active: true }],
        assignments: [
          {
            id: 'a4',
            programId: 'prog-2',
            userId: 'u4',
            startDayKey: '2026-11-05',
            startDate: new Date('2026-11-05T12:00:00Z'),
            endDate: null,
            status: ProgramStatus.ACTIVE,
            reportData: null,
            createdAt: new Date(),
            user: { id: 'u4', name: 'Contínuo' },
          },
        ],
      },
    ];

    const repo = {
      listPrograms: jest.fn().mockResolvedValue(programs),
      listCompletedSessionsSince: jest.fn(),
      listCompletedSessionDaysForUsers: jest.fn().mockResolvedValue([
        // u1 treinou dias 2 e 5 (contam para a1) e também no treino w2 (não pertence a prog-1)
        { userId: 'u1', workoutId: 'w1', dayKey: '2026-11-02' },
        { userId: 'u1', workoutId: 'w1', dayKey: '2026-11-05' },
        { userId: 'u1', workoutId: 'w2', dayKey: '2026-11-06' },
        // u2 treinou dia 8 (ANTES do startDayKey 2026-11-10 -> não deve contar) e dia 11 (conta)
        { userId: 'u2', workoutId: 'w1', dayKey: '2026-11-08' },
        { userId: 'u2', workoutId: 'w1', dayKey: '2026-11-11' },
      ]),
    } as unknown as jest.Mocked<ProgramRepository>;

    const progressService = new ProgramProgressService(repo);
    jest
      .spyOn(progressService, 'calculateForAssignments')
      .mockImplementation((assignments) =>
        ProgramProgressService.prototype.calculateForAssignments.call(
          progressService,
          assignments,
          '2026-11-15',
        ),
      );

    const useCase = new ListProgramsUseCase(repo, progressService);
    const result = await useCase.execute();

    expect(repo.listCompletedSessionsSince).not.toHaveBeenCalled();
    expect(repo.listCompletedSessionDaysForUsers).toHaveBeenCalledTimes(1);
    expect(repo.listCompletedSessionDaysForUsers).toHaveBeenCalledWith(
      ['u1', 'u2'],
      ['w1'],
      '2026-11-01',
      ['a1', 'a2'],
    );

    expect(result[0].assignments[0].progress).toMatchObject({
      currentDayNumber: 15,
      totalDays: 30,
      completedWorkoutsCount: 2,
      trainedDaysCount: 2,
    });
    expect(result[0].assignments[1].progress).toMatchObject({
      currentDayNumber: 6,
      totalDays: 30,
      completedWorkoutsCount: 1,
      trainedDaysCount: 1,
    });
    expect(result[0].assignments[2].progress).toBeNull();
    expect(result[1].assignments[0].progress).toBeNull();
  });
});
