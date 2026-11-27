import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ExerciseMode,
  LinkEndReason,
  LinkStatus,
  ProgramStatus,
  ProgramType,
  Role,
} from '@prisma/client';
import { CacheService } from '../../../../shared/cache/cache.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { PushService } from '../../../push/application/push.service';
import { TrainerAccessService } from '../trainer-access.service';
import {
  AcceptLinkUseCase,
  EndLinkUseCase,
  RejectLinkUseCase,
  RequestLinkUseCase,
} from './links.use-cases';

const CTX = { ip: '127.0.0.1', userAgent: 'Jest', requestId: 'r1' };

describe('LinksModule — ciclo de vida de vínculos e Copy-on-Transfer', () => {
  it('RequestLinkUseCase bloqueia com 409 quando o aluno já tem personal ACTIVE e cria convite + push quando livre', async () => {
    const push = { notifyUsers: jest.fn().mockResolvedValue(undefined) } as unknown as PushService;
    const security = { event: jest.fn() } as unknown as SecurityLogger;

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'u-trainee' }]),
      trainerTraineeLink: {
        findFirst: jest
          .fn()
          // 1ª chamada: já tem vínculo ACTIVE -> 409
          .mockResolvedValueOnce({ id: 'lnk-old', status: LinkStatus.ACTIVE })
          // 2ª chamada (livre): nenhum ACTIVE
          .mockResolvedValueOnce(null)
          // nenhum PENDING do mesmo trainer
          .mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue({
          id: 'lnk-new',
          trainerId: 'u-pers-b',
          traineeId: 'u-trainee',
          status: LinkStatus.PENDING,
          trainer: { id: 'u-pers-b', name: 'Personal B', username: 'personal.b', active: true },
          trainee: { id: 'u-trainee', name: 'Ninfa', username: 'ninfa', active: true },
        }),
      },
    };

    const prisma = {
      user: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          if (where.username === 'ninfa') {
            return { id: 'u-trainee', name: 'Ninfa', username: 'ninfa', role: Role.TRAINEE, active: true };
          }
          if (where.id === 'u-pers-b') {
            return { id: 'u-pers-b', name: 'Personal B', username: 'personal.b', active: true };
          }
          return null;
        }),
      },
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    } as unknown as PrismaService;

    const useCase = new RequestLinkUseCase(prisma, push, security);

    // Aluno com personal ativo -> 409
    await expect(
      useCase.execute('u-pers-b', { username: '@ninfa' }, CTX),
    ).rejects.toThrow(ConflictException);

    // Aluno não existente -> 404
    await expect(
      useCase.execute('u-pers-b', { username: 'nao.existe' }, CTX),
    ).rejects.toThrow(NotFoundException);

    // Aluno livre -> cria PENDING e dispara push
    const created = await useCase.execute('u-pers-b', { username: 'ninfa' }, CTX);
    expect(created.id).toBe('lnk-new');
    expect(push.notifyUsers).toHaveBeenCalledWith(
      ['u-trainee'],
      expect.objectContaining({ title: expect.stringContaining('Convite') }),
    );
    expect(security.event).toHaveBeenCalledWith(
      'link.requested',
      expect.objectContaining({ userId: 'u-trainee', actorUserId: 'u-pers-b' }),
    );
  });

  it('AcceptLinkUseCase executa Copy-on-Transfer de desafio ativo (preservando startDayKey e logs) e treinos avulsos', async () => {
    const cache = { invalidarUsuario: jest.fn().mockResolvedValue(undefined) } as unknown as CacheService;
    const push = { notifyUsers: jest.fn().mockResolvedValue(undefined) } as unknown as PushService;
    const security = { event: jest.fn() } as unknown as SecurityLogger;

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'u-trainee' }]),
      trainerTraineeLink: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'lnk-b',
          trainerId: 'u-pers-b',
          traineeId: 'u-trainee',
          status: LinkStatus.PENDING,
          trainer: { id: 'u-pers-b', name: 'Personal B', username: 'personal.b', active: true },
          trainee: { id: 'u-trainee', name: 'Ninfa', username: 'ninfa', active: true },
        }),
        findFirst: jest.fn().mockResolvedValue(null), // nenhum ACTIVE concorrente
        update: jest.fn().mockResolvedValue({
          id: 'lnk-b',
          trainerId: 'u-pers-b',
          traineeId: 'u-trainee',
          status: LinkStatus.ACTIVE,
          trainer: { id: 'u-pers-b', name: 'Personal B', username: 'personal.b', active: true },
          trainee: { id: 'u-trainee', name: 'Ninfa', username: 'ninfa', active: true },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      programAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pa-12',
          programId: 'prog-a',
          userId: 'u-trainee',
          startDayKey: '2026-11-10',
          status: ProgramStatus.ACTIVE,
          program: {
            id: 'prog-a',
            name: 'Desafio 30 Dias',
            description: 'Foco glúteo',
            type: ProgramType.CHALLENGE,
            targetWeeks: null,
            targetDays: 30,
            ownerTrainerId: 'u-pers-a',
            workouts: [
              {
                id: 'w-prog-a',
                name: 'Treino A',
                dayOfWeek: 1,
                active: true,
                exercises: [
                  {
                    exerciseId: 'ex-1',
                    order: 0,
                    mode: ExerciseMode.REPS,
                    sets: 3,
                    reps: '12',
                    durationSeconds: null,
                    restSeconds: 60,
                    notes: null,
                  },
                ],
              },
            ],
          },
        }),
        update: jest.fn().mockResolvedValue({ id: 'pa-12', programId: 'prog-b-clone' }),
      },
      trainingProgram: {
        create: jest.fn().mockResolvedValue({ id: 'prog-b-clone' }),
      },
      workoutLog: {
        updateMany: jest.fn().mockResolvedValue({ count: 11 }),
      },
      workout: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'w-prog-b-clone' })
          .mockResolvedValueOnce({ id: 'w-avulso-b-clone' }),
      },
      workoutAssignment: {
        create: jest.fn().mockResolvedValue({ id: 'wa-new' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([
          {
            workout: {
              id: 'w-avulso-a',
              name: 'Cardio Sabado',
              dayOfWeek: 6,
              active: true,
              ownerTrainerId: 'u-pers-a',
              exercises: [],
            },
          },
        ]),
      },
    };

    const prisma = {
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    } as unknown as PrismaService;

    const accept = new AcceptLinkUseCase(prisma, cache, push, security);
    const res = await accept.execute('u-trainee', 'lnk-b', CTX);

    expect(res).toMatchObject({
      portedProgram: true,
      portedWorkoutsCount: 2,
    });
    // Desafio clonado para o novo personal mantendo referência ao original
    expect(tx.trainingProgram.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Desafio 30 Dias',
        ownerTrainerId: 'u-pers-b',
        clonedFromId: 'prog-a',
      }),
    });
    // Logs antigos vinculados ao ProgramAssignment antes de apontar pro programa clonado (Dia 12/30 intacto!)
    expect(tx.workoutLog.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'u-trainee',
        workoutId: 'w-prog-a',
        dayKey: { gte: '2026-11-10' },
        programAssignmentId: null,
      },
      data: { programAssignmentId: 'pa-12' },
    });
    expect(tx.programAssignment.update).toHaveBeenCalledWith({
      where: { id: 'pa-12' },
      data: { programId: 'prog-b-clone' },
    });
    // Treinos clonados com novo ownerTrainerId e atribuições antigas removidas
    expect(tx.workout.create).toHaveBeenCalledTimes(2);
    expect(tx.workoutAssignment.deleteMany).toHaveBeenCalledWith({
      where: { workoutId: 'w-prog-a', userId: 'u-trainee' },
    });
    expect(tx.workoutAssignment.deleteMany).toHaveBeenCalledWith({
      where: { workoutId: 'w-avulso-a', userId: 'u-trainee' },
    });
    // Também limpa assignments de treinos INATIVOS de outros personais
    expect(tx.workoutAssignment.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'u-trainee',
        workout: {
          OR: [
            { ownerTrainerId: null },
            { ownerTrainerId: { not: 'u-pers-b' } },
          ],
        },
      },
    });
    expect(security.event).toHaveBeenCalledWith(
      'link.accepted',
      expect.objectContaining({ userId: 'u-trainee', statusCode: 200 }),
    );
  });

  it('RejectLinkUseCase e EndLinkUseCase aplicam lock FOR UPDATE, ownership e motivos corretos de encerramento', async () => {
    const cache = { invalidarUsuario: jest.fn().mockResolvedValue(undefined) } as unknown as CacheService;
    const security = { event: jest.fn() } as unknown as SecurityLogger;
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      trainerTraineeLink: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'lnk-1',
          trainerId: 'p1',
          traineeId: 't1',
          ...data,
        })),
      },
    };
    const prisma = {
      trainerTraineeLink: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (fn) => fn(tx)),
    } as unknown as PrismaService;

    const reject = new RejectLinkUseCase(prisma, security);
    const end = new EndLinkUseCase(prisma, cache, security);

    // Outro aluno tentando recusar -> 403
    tx.trainerTraineeLink.findUnique.mockResolvedValueOnce({
      id: 'lnk-1',
      trainerId: 'p1',
      traineeId: 't1',
      status: LinkStatus.PENDING,
    });
    await expect(reject.execute('t-outro', 'lnk-1', CTX)).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);

    // Aluno encerrando vínculo ACTIVE -> TRAINEE_ENDED
    (prisma.trainerTraineeLink.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'lnk-1',
      traineeId: 't1',
    });
    tx.trainerTraineeLink.findUnique.mockResolvedValueOnce({
      id: 'lnk-1',
      trainerId: 'p1',
      traineeId: 't1',
      status: LinkStatus.ACTIVE,
    });
    const endedByTrainee = await end.execute('t1', Role.TRAINEE, 'lnk-1', CTX);
    expect(endedByTrainee.endedReason).toBe(LinkEndReason.TRAINEE_ENDED);

    // Personal cancelando convite PENDING -> TRAINER_CANCELLED
    (prisma.trainerTraineeLink.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'lnk-2',
      traineeId: 't1',
    });
    tx.trainerTraineeLink.findUnique.mockResolvedValueOnce({
      id: 'lnk-2',
      trainerId: 'p1',
      traineeId: 't1',
      status: LinkStatus.PENDING,
    });
    const cancelledByTrainer = await end.execute('p1', Role.PERSONAL, 'lnk-2', CTX);
    expect(cancelledByTrainer.endedReason).toBe(LinkEndReason.TRAINER_CANCELLED);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it('TrainerAccessService bloqueia personal sem vínculo ativo e encerra todos os vínculos ao desligar personal', async () => {
    const prisma = {
      trainerTraineeLink: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ traineeId: 't1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    } as unknown as PrismaService;

    const access = new TrainerAccessService(prisma);

    await expect(access.assertActiveLink('p1', 't-sem-vinculo')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(access.assertAllActiveLinks('p1', ['t1', 't2'])).rejects.toThrow(
      ForbiddenException,
    );
    await expect(access.assertAllActiveLinks('p1', ['t1'])).resolves.toBeUndefined();

    const closed = await access.endAllLinksForTrainer(
      'p1',
      LinkEndReason.TRAINER_DEACTIVATED,
    );
    expect(closed).toBe(3);
    expect(prisma.trainerTraineeLink.updateMany).toHaveBeenCalledWith({
      where: {
        trainerId: 'p1',
        status: { in: [LinkStatus.ACTIVE, LinkStatus.PENDING] },
      },
      data: expect.objectContaining({
        status: LinkStatus.ENDED,
        endedReason: LinkEndReason.TRAINER_DEACTIVATED,
      }),
    });
  });
});
