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
});
