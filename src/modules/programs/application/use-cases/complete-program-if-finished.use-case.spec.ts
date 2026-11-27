import { ProgramStatus, ProgramType } from '@prisma/client';
import { CompleteProgramIfFinishedUseCase } from './complete-program-if-finished.use-case';
import { ProgramProgressService } from '../services/program-progress.service';
import { AssignmentWithProgram, ProgramRepository } from '../../domain/program.repository';

function buildAssignment(overrides: {
  programType: ProgramType;
  targetDays?: number | null;
  status?: ProgramStatus;
}): AssignmentWithProgram {
  return {
    id: 'assignment-1',
    programId: 'program-1',
    userId: 'aluna-1',
    startDayKey: '2026-11-01',
    startDate: new Date('2026-11-01T12:00:00Z'),
    endDate: null,
    status: overrides.status ?? ProgramStatus.ACTIVE,
    reportData: null,
    createdAt: new Date('2026-11-01T12:00:00Z'),
    program: {
      id: 'program-1',
      name: 'Desafio 30 Dias',
      description: null,
      type: overrides.programType,
      targetWeeks: null,
      targetDays: overrides.targetDays ?? null,
      ownerTrainerId: null,
      clonedFromId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      workouts: [{ id: 'treino-perna', name: 'Perna', dayOfWeek: null, active: true }],
    },
  };
}

function buildUseCase(currentAssignment: AssignmentWithProgram | null, todayDayKey: string) {
  const programRepository = {
    findCurrentAssignmentByUser: jest.fn().mockResolvedValue(currentAssignment),
    listCompletedSessionsSince: jest.fn().mockResolvedValue([
      { dayKey: '2026-11-01', exerciseLoads: [{ exerciseId: 'agachamento', load: 40 }] },
      { dayKey: '2026-11-30', exerciseLoads: [{ exerciseId: 'agachamento', load: 50 }] },
    ]),
    markAssignmentCompleted: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<ProgramRepository>;

  const programProgressService = new ProgramProgressService(programRepository);
  jest
    .spyOn(programProgressService, 'calculateForAssignment')
    .mockImplementation((assignment) =>
      ProgramProgressService.prototype.calculateForAssignment.call(
        programProgressService,
        assignment,
        todayDayKey,
      ),
    );

  return {
    useCase: new CompleteProgramIfFinishedUseCase(programRepository, programProgressService),
    programRepository,
  };
}

describe('CompleteProgramIfFinishedUseCase', () => {
  it('encerra o desafio e gera o relatório no último dia', async () => {
    const { useCase, programRepository } = buildUseCase(
      buildAssignment({ programType: ProgramType.CHALLENGE, targetDays: 30 }),
      '2026-11-30',
    );

    const completionResult = await useCase.execute('aluna-1', 'treino-perna');

    expect(completionResult.programCompleted).toBe(true);
    expect(completionResult.report).toMatchObject({
      totalDays: 30,
      completedWorkoutsCount: 2,
      trainedDaysCount: 2,
      loadEvolutionPercentage: 25,
    });
    expect(programRepository.markAssignmentCompleted).toHaveBeenCalledWith(
      'assignment-1',
      expect.objectContaining({ programName: 'Desafio 30 Dias' }),
    );
  });

  it('não encerra antes do último dia', async () => {
    const { useCase, programRepository } = buildUseCase(
      buildAssignment({ programType: ProgramType.CHALLENGE, targetDays: 30 }),
      '2026-11-19',
    );
    const completionResult = await useCase.execute('aluna-1', 'treino-perna');
    expect(completionResult.programCompleted).toBe(false);
    expect(programRepository.markAssignmentCompleted).not.toHaveBeenCalled();
  });

  it('nunca encerra um treino contínuo', async () => {
    const { useCase, programRepository } = buildUseCase(
      buildAssignment({ programType: ProgramType.CONTINUOUS }),
      '2027-06-01',
    );
    const completionResult = await useCase.execute('aluna-1', 'treino-perna');
    expect(completionResult.programCompleted).toBe(false);
    expect(programRepository.markAssignmentCompleted).not.toHaveBeenCalled();
  });

  it('ignora treinos que não são do programa', async () => {
    const { useCase } = buildUseCase(
      buildAssignment({ programType: ProgramType.CHALLENGE, targetDays: 30 }),
      '2026-11-30',
    );
    const completionResult = await useCase.execute('aluna-1', 'outro-treino');
    expect(completionResult.programCompleted).toBe(false);
  });

  it('conta a sessão aberta já vinculada à participação atual (treino portado na transferência)', async () => {
    const { useCase } = buildUseCase(
      buildAssignment({ programType: ProgramType.CHALLENGE, targetDays: 30 }),
      '2026-11-30',
    );
    const completionResult = await useCase.execute('aluna-1', 'treino-antigo', 'assignment-1');
    expect(completionResult.programCompleted).toBe(true);
  });

  it('não reporta conclusão quando outra operação já mudou o status (corrida/replay)', async () => {
    const { useCase, programRepository } = buildUseCase(
      buildAssignment({ programType: ProgramType.CHALLENGE, targetDays: 30 }),
      '2026-11-30',
    );
    programRepository.markAssignmentCompleted.mockResolvedValueOnce(false);
    const completionResult = await useCase.execute('aluna-1', 'treino-perna');
    expect(completionResult).toEqual({ programCompleted: false, report: null });
  });
});
