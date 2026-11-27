import { Prisma, ProgramStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { PrismaProgramRepository } from './prisma-program.repository';

describe('PrismaProgramRepository — preservação de conquistas', () => {
  it('inclui participações COMPLETED e ARCHIVED com reportData ao listar conquistas', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      programAssignment: { findMany },
    } as unknown as PrismaService;

    const repo = new PrismaProgramRepository(prisma);
    await repo.listCompletedAssignmentsByUser('aluna-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'aluna-1',
          status: { in: [ProgramStatus.COMPLETED, ProgramStatus.ARCHIVED] },
          reportData: { not: Prisma.DbNull },
        },
        orderBy: { endDate: 'desc' },
      }),
    );
  });

  it('preserva o endDate original ao arquivar uma participação COMPLETED', async () => {
    const originalEndDate = new Date('2026-11-20T18:30:00Z');
    const tx = {
      programAssignment: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'assign-1',
          userId: 'aluna-1',
          programId: 'prog-1',
          endDate: originalEndDate,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      workoutAssignment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    } as unknown as PrismaService;

    const repo = new PrismaProgramRepository(prisma);
    await repo.archiveAssignment('assign-1');

    expect(tx.programAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assign-1' },
      data: {
        status: ProgramStatus.ARCHIVED,
        endDate: originalEndDate,
      },
    });
    expect(tx.workoutAssignment.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'aluna-1', workout: { programId: 'prog-1' } },
    });
  });

  it('preenche endDate com a data atual ao arquivar uma participação ACTIVE (sem endDate)', async () => {
    const tx = {
      programAssignment: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'assign-2',
          userId: 'aluna-1',
          programId: 'prog-1',
          endDate: null,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      workoutAssignment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    } as unknown as PrismaService;

    const repo = new PrismaProgramRepository(prisma);
    await repo.archiveAssignment('assign-2');

    expect(tx.programAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assign-2' },
      data: {
        status: ProgramStatus.ARCHIVED,
        endDate: expect.any(Date),
      },
    });
  });

  it('arquiva programas anteriores e atribui o novo numa única transação com lock FOR UPDATE', async () => {
    const completedDate = new Date('2026-11-10T12:00:00Z');
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'aluna-1' }, { id: 'aluna-2' }]),
      programAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'old-completed',
            userId: 'aluna-1',
            programId: 'prog-antigo',
            status: ProgramStatus.COMPLETED,
            endDate: completedDate,
          },
          {
            id: 'already-active',
            userId: 'aluna-2',
            programId: 'prog-novo',
            status: ProgramStatus.ACTIVE,
            endDate: null,
          },
        ]),
        update: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      workout: {
        findMany: jest.fn().mockResolvedValue([{ id: 'w-novo-1' }, { id: 'w-novo-2' }]),
      },
      workoutAssignment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<string[]>) => fn(tx)),
    } as unknown as PrismaService;

    const repo = new PrismaProgramRepository(prisma);
    const added = await repo.assignProgramToUsers(
      'prog-novo',
      ['aluna-2', 'aluna-1', 'aluna-1'],
      '2026-11-26',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(added).toEqual(['aluna-1']);
    // Arquivou a participação COMPLETED da aluna-1 preservando o endDate original
    expect(tx.programAssignment.update).toHaveBeenCalledTimes(1);
    expect(tx.programAssignment.update).toHaveBeenCalledWith({
      where: { id: 'old-completed' },
      data: { status: ProgramStatus.ARCHIVED, endDate: completedDate },
    });
    expect(tx.workoutAssignment.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'aluna-1', workout: { programId: 'prog-antigo' } },
    });
    // Só criou atribuição nova para aluna-1 (aluna-2 já estava ACTIVE no prog-novo)
    expect(tx.programAssignment.createMany).toHaveBeenCalledWith({
      data: [{ programId: 'prog-novo', userId: 'aluna-1', startDayKey: '2026-11-26' }],
    });
    expect(tx.workoutAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { workoutId: 'w-novo-1', userId: 'aluna-1' },
        { workoutId: 'w-novo-2', userId: 'aluna-1' },
      ],
      skipDuplicates: true,
    });
  });
});

describe('PrismaProgramRepository — updateProgram (regressão v2.1.1)', () => {
  function buildTx() {
    return {
      trainingProgram: {
        update: jest.fn().mockResolvedValue(undefined),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'prog-1' }),
      },
      workout: {
        findMany: jest.fn().mockResolvedValue([{ id: 'w-removido' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      programAssignment: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'aluna-ativa' }, { userId: 'ex-aluna' }]),
      },
      workoutAssignment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  it('NÃO envia allowedUserIds/workoutIds para trainingProgram.update e escopa aos alunos ativos', async () => {
    const tx = buildTx();
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;

    const repo = new PrismaProgramRepository(prisma);
    await repo.updateProgram('prog-1', {
      name: 'Novo nome',
      workoutIds: ['w-1'],
      allowedUserIds: ['aluna-ativa'],
    });

    expect(tx.trainingProgram.update).toHaveBeenCalledWith({
      where: { id: 'prog-1' },
      data: { name: 'Novo nome' },
    });
    const sentData = tx.trainingProgram.update.mock.calls[0][0].data;
    expect(sentData).not.toHaveProperty('allowedUserIds');
    expect(sentData).not.toHaveProperty('workoutIds');
    expect(tx.workoutAssignment.deleteMany).toHaveBeenCalledWith({
      where: { workoutId: { in: ['w-removido'] }, userId: { in: ['aluna-ativa'] } },
    });
    expect(tx.workoutAssignment.createMany).toHaveBeenCalledWith({
      data: [{ workoutId: 'w-1', userId: 'aluna-ativa' }],
      skipDuplicates: true,
    });
  });
});

describe('PrismaProgramRepository — markAssignmentCompleted (concorrência)', () => {
  const report = {
    programName: 'Desafio',
    programType: 'CHALLENGE',
    totalDays: 30,
    trainedDaysCount: 20,
    completedWorkoutsCount: 20,
    loadEvolutionPercentage: 10,
    completedAt: '2026-11-30T12:00:00.000Z',
  } as never;

  function build(count: number, found = true) {
    const tx = {
      programAssignment: {
        findUnique: jest.fn().mockResolvedValue(found ? { userId: 'aluna-1' } : null),
        updateMany: jest.fn().mockResolvedValue({ count }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    return { tx, repo: new PrismaProgramRepository(prisma) };
  }

  it('trava o aluno e só conclui participações ainda ACTIVE', async () => {
    const { tx, repo } = build(1);
    await expect(repo.markAssignmentCompleted('assign-1', report)).resolves.toBe(true);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.programAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'assign-1', status: ProgramStatus.ACTIVE },
        data: expect.objectContaining({ status: ProgramStatus.COMPLETED }),
      }),
    );
  });

  it('retorna false quando a participação já foi arquivada/concluída por outra operação', async () => {
    const { repo } = build(0);
    await expect(repo.markAssignmentCompleted('assign-1', report)).resolves.toBe(false);
  });

  it('retorna false quando a participação não existe mais', async () => {
    const { tx, repo } = build(1, false);
    await expect(repo.markAssignmentCompleted('assign-1', report)).resolves.toBe(false);
    expect(tx.programAssignment.updateMany).not.toHaveBeenCalled();
  });
});
