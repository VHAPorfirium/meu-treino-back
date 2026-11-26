import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LinkEndReason,
  LinkStatus,
  Prisma,
  ProgramStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { CacheService } from '../../../../shared/cache/cache.service';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { normalizeUsername } from '../../../../shared/security/cpf-and-password';
import { PushService } from '../../../push/application/push.service';
import { RequestLinkDto } from '../dto/request-link.dto';

export interface LinkAuditContext {
  ip: string;
  userAgent?: string;
  requestId?: string;
}

const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  username: true,
  active: true,
} as const;

/**
 * PERSONAL → solicita vínculo com um TRAINEE usando o `username` exato.
 * Rejeita com 409 se o aluno já possui personal `ACTIVE` (o vínculo anterior precisa
 * ser encerrado antes) ou se já há convite `PENDING` deste mesmo personal.
 */
@Injectable()
export class RequestLinkUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly security: SecurityLogger,
  ) {}

  async execute(
    trainerId: string,
    dto: RequestLinkDto,
    ctx: LinkAuditContext,
  ) {
    const normalized = normalizeUsername(dto.username.replace(/^@/, ''));
    if (!normalized) {
      throw new BadRequestException('Informe um apelido válido');
    }

    const trainee = await this.prisma.user.findUnique({
      where: { username: normalized },
      select: { id: true, name: true, username: true, role: true, active: true },
    });
    if (!trainee || trainee.role !== Role.TRAINEE || !trainee.active) {
      throw new NotFoundException('Aluno não encontrado ou conta desativada');
    }

    const trainer = await this.prisma.user.findUnique({
      where: { id: trainerId },
      select: USER_PUBLIC_SELECT,
    });
    if (!trainer || !trainer.active) {
      throw new ForbiddenException('Conta de personal inválida');
    }

    const link = await this.prisma.$transaction(async (tx) => {
      // Lock pessimista no registro do aluno para serializar solicitações concorrentes
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${trainee.id} FOR UPDATE`,
      );

      const activeLink = await tx.trainerTraineeLink.findFirst({
        where: { traineeId: trainee.id, status: LinkStatus.ACTIVE },
      });
      if (activeLink) {
        throw new ConflictException(
          'Este aluno já está vinculado a um personal ativo. O vínculo atual precisa ser encerrado primeiro.',
        );
      }

      const pendingSameTrainer = await tx.trainerTraineeLink.findFirst({
        where: {
          trainerId,
          traineeId: trainee.id,
          status: LinkStatus.PENDING,
        },
      });
      if (pendingSameTrainer) {
        throw new ConflictException(
          'Você já enviou uma solicitação pendente para este aluno.',
        );
      }

      return tx.trainerTraineeLink.create({
        data: {
          trainerId,
          traineeId: trainee.id,
          status: LinkStatus.PENDING,
        },
        include: {
          trainer: { select: USER_PUBLIC_SELECT },
          trainee: { select: USER_PUBLIC_SELECT },
        },
      });
    });

    this.security.event('link.requested', {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      userId: trainee.id,
      actorUserId: trainerId,
      role: Role.PERSONAL,
      method: 'POST',
      path: '/api/links/request',
      statusCode: 201,
    });

    void this.push.notifyUsers([trainee.id], {
      title: 'Convite de Personal 💪',
      body: `${trainer.name} (@${trainer.username}) quer acompanhar seus treinos. Abra o app para confirmar.`,
      url: '/treino',
    });

    return link;
  }
}

/** PERSONAL → lista seus vínculos `PENDING` e `ACTIVE`. */
@Injectable()
export class ListSentLinksUseCase {
  constructor(private readonly prisma: PrismaService) {}

  execute(trainerId: string) {
    return this.prisma.trainerTraineeLink.findMany({
      where: {
        trainerId,
        status: { in: [LinkStatus.PENDING, LinkStatus.ACTIVE] },
      },
      include: {
        trainee: { select: USER_PUBLIC_SELECT },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }
}

/** TRAINEE → lista convites `PENDING` de personais ativos. */
@Injectable()
export class ListPendingLinksUseCase {
  constructor(private readonly prisma: PrismaService) {}

  execute(traineeId: string) {
    return this.prisma.trainerTraineeLink.findMany({
      where: {
        traineeId,
        status: LinkStatus.PENDING,
        trainer: { active: true },
      },
      include: {
        trainer: { select: USER_PUBLIC_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

/** TRAINEE → retorna o vínculo `ACTIVE` atual (ou `{ link: null }`). */
@Injectable()
export class GetCurrentLinkUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(traineeId: string) {
    const link = await this.prisma.trainerTraineeLink.findFirst({
      where: { traineeId, status: LinkStatus.ACTIVE },
      include: {
        trainer: { select: USER_PUBLIC_SELECT },
      },
    });
    return { link };
  }
}

/**
 * TRAINEE → aceita solicitação de vínculo e executa **Copy-on-Transfer** atômico:
 *  1. Clona o programa/desafio `ACTIVE` do aluno (se pertencer a outro personal) e seus
 *     treinos ativos para o novo `ownerTrainerId`, atualizando o `ProgramAssignment` sem
 *     zerar `startDayKey` nem perder dias já cumpridos (`WorkoutLog.programAssignmentId`).
 *  2. Clona treinos avulsos ativos direcionados ao aluno de outros personais para o novo
 *     `ownerTrainerId`, transferindo o `WorkoutAssignment` do aluno.
 *  3. Fotos (`ProgressPhoto`) e recados (`TrainerNote`) antigos NÃO são migrados — ficam
 *     invisíveis ao novo personal e continuam visíveis ao próprio aluno.
 */
@Injectable()
export class AcceptLinkUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly push: PushService,
    private readonly security: SecurityLogger,
  ) {}

  async execute(traineeId: string, linkId: string, ctx: LinkAuditContext) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${traineeId} FOR UPDATE`,
      );

      const link = await tx.trainerTraineeLink.findUnique({
        where: { id: linkId },
        include: {
          trainer: { select: USER_PUBLIC_SELECT },
          trainee: { select: USER_PUBLIC_SELECT },
        },
      });
      if (!link) throw new NotFoundException('Solicitação de vínculo não encontrada');
      if (link.traineeId !== traineeId) {
        throw new ForbiddenException('Esta solicitação não pertence a você');
      }
      if (link.status !== LinkStatus.PENDING) {
        throw new BadRequestException('Esta solicitação não está mais pendente');
      }
      if (!link.trainer.active) {
        throw new BadRequestException('Este personal não está mais ativo');
      }

      const alreadyActive = await tx.trainerTraineeLink.findFirst({
        where: { traineeId, status: LinkStatus.ACTIVE },
      });
      if (alreadyActive) {
        throw new ConflictException(
          'Você já possui um personal ativo. Encerre o vínculo atual primeiro.',
        );
      }

      const now = new Date();
      const acceptedLink = await tx.trainerTraineeLink.update({
        where: { id: link.id },
        data: { status: LinkStatus.ACTIVE, respondedAt: now },
        include: {
          trainer: { select: USER_PUBLIC_SELECT },
          trainee: { select: USER_PUBLIC_SELECT },
        },
      });

      // Rejeita demais convites pendentes concorrentes para manter estado consistente
      await tx.trainerTraineeLink.updateMany({
        where: {
          traineeId,
          status: LinkStatus.PENDING,
          id: { not: link.id },
        },
        data: { status: LinkStatus.REJECTED, respondedAt: now },
      });

      const handledOldWorkoutIds = new Set<string>();
      let portedWorkoutsCount = 0;
      let portedProgram = false;

      // 1) Copy-on-Transfer do programa/desafio ACTIVE (preservando Dia N/M via programAssignmentId)
      const activeProgramAssignment = await tx.programAssignment.findFirst({
        where: { userId: traineeId, status: ProgramStatus.ACTIVE },
        include: {
          program: {
            include: {
              workouts: {
                where: { active: true },
                include: { exercises: { orderBy: { order: 'asc' } } },
              },
            },
          },
        },
      });

      if (
        activeProgramAssignment &&
        activeProgramAssignment.program.ownerTrainerId !== link.trainerId
      ) {
        const oldProgram = activeProgramAssignment.program;
        const clonedProgram = await tx.trainingProgram.create({
          data: {
            name: oldProgram.name,
            description: oldProgram.description,
            type: oldProgram.type,
            targetWeeks: oldProgram.targetWeeks,
            targetDays: oldProgram.targetDays,
            ownerTrainerId: link.trainerId,
            clonedFromId: oldProgram.id,
          },
        });

        for (const oldWorkout of oldProgram.workouts) {
          handledOldWorkoutIds.add(oldWorkout.id);
          // Garante que logs anteriores desse desafio carreguem programAssignmentId antes da troca
          await tx.workoutLog.updateMany({
            where: {
              userId: traineeId,
              workoutId: oldWorkout.id,
              dayKey: { gte: activeProgramAssignment.startDayKey },
              programAssignmentId: null,
            },
            data: { programAssignmentId: activeProgramAssignment.id },
          });

          const clonedWorkout = await tx.workout.create({
            data: {
              name: oldWorkout.name,
              dayOfWeek: oldWorkout.dayOfWeek,
              active: true,
              programId: clonedProgram.id,
              ownerTrainerId: link.trainerId,
              clonedFromId: oldWorkout.id,
              exercises: {
                create: oldWorkout.exercises.map((ex) => ({
                  exerciseId: ex.exerciseId,
                  order: ex.order,
                  mode: ex.mode,
                  sets: ex.sets,
                  reps: ex.reps,
                  durationSeconds: ex.durationSeconds,
                  restSeconds: ex.restSeconds,
                  notes: ex.notes,
                })),
              },
            },
          });

          await tx.workoutAssignment.create({
            data: { workoutId: clonedWorkout.id, userId: traineeId },
          });
          await tx.workoutAssignment.deleteMany({
            where: { workoutId: oldWorkout.id, userId: traineeId },
          });
          portedWorkoutsCount += 1;
        }

        await tx.programAssignment.update({
          where: { id: activeProgramAssignment.id },
          data: { programId: clonedProgram.id },
        });
        portedProgram = true;
      }

      // 2) Copy-on-Transfer dos demais treinos ativos direcionados ao aluno
      const standaloneAssignments = await tx.workoutAssignment.findMany({
        where: {
          userId: traineeId,
          workout: {
            active: true,
            OR: [
              { ownerTrainerId: null },
              { ownerTrainerId: { not: link.trainerId } },
            ],
          },
        },
        include: {
          workout: {
            include: { exercises: { orderBy: { order: 'asc' } } },
          },
        },
      });

      for (const assignment of standaloneAssignments) {
        const oldWorkout = assignment.workout;
        if (handledOldWorkoutIds.has(oldWorkout.id)) continue;

        const clonedWorkout = await tx.workout.create({
          data: {
            name: oldWorkout.name,
            dayOfWeek: oldWorkout.dayOfWeek,
            active: true,
            programId: null,
            ownerTrainerId: link.trainerId,
            clonedFromId: oldWorkout.id,
            exercises: {
              create: oldWorkout.exercises.map((ex) => ({
                exerciseId: ex.exerciseId,
                order: ex.order,
                mode: ex.mode,
                sets: ex.sets,
                reps: ex.reps,
                durationSeconds: ex.durationSeconds,
                restSeconds: ex.restSeconds,
                notes: ex.notes,
              })),
            },
          },
        });

        await tx.workoutAssignment.create({
          data: { workoutId: clonedWorkout.id, userId: traineeId },
        });
        await tx.workoutAssignment.deleteMany({
          where: { workoutId: oldWorkout.id, userId: traineeId },
        });
        portedWorkoutsCount += 1;
      }

      return { link: acceptedLink, portedWorkoutsCount, portedProgram };
    });

    await Promise.all([
      this.cache.invalidarUsuario(traineeId),
      this.cache.invalidarUsuario(result.link.trainerId),
      this.cache.invalidarUsuario('all'),
    ]);

    this.security.event('link.accepted', {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      userId: traineeId,
      actorUserId: traineeId,
      role: Role.TRAINEE,
      method: 'POST',
      path: `/api/links/${linkId}/accept`,
      statusCode: 200,
    });

    void this.push.notifyUsers([result.link.trainerId], {
      title: 'Vínculo confirmado! 🎉',
      body: `${result.link.trainee.name} aceitou seu convite${
        result.portedWorkoutsCount > 0
          ? ` (${result.portedWorkoutsCount} treino(s) portado(s)).`
          : '.'
      }`,
      url: '/dashboard/alunos',
    });

    return result;
  }
}

/** TRAINEE → recusa solicitação pendente. */
@Injectable()
export class RejectLinkUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityLogger,
  ) {}

  async execute(traineeId: string, linkId: string, ctx: LinkAuditContext) {
    const link = await this.prisma.trainerTraineeLink.findUnique({
      where: { id: linkId },
    });
    if (!link) throw new NotFoundException('Solicitação não encontrada');
    if (link.traineeId !== traineeId) {
      throw new ForbiddenException('Esta solicitação não pertence a você');
    }
    if (link.status !== LinkStatus.PENDING) {
      throw new BadRequestException('Esta solicitação não está mais pendente');
    }

    const updated = await this.prisma.trainerTraineeLink.update({
      where: { id: link.id },
      data: { status: LinkStatus.REJECTED, respondedAt: new Date() },
    });

    this.security.event('link.rejected', {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      userId: traineeId,
      actorUserId: traineeId,
      role: Role.TRAINEE,
      method: 'POST',
      path: `/api/links/${linkId}/reject`,
      statusCode: 200,
    });

    return updated;
  }
}

/** TRAINEE ou PERSONAL → encerra vínculo ACTIVE (ou PERSONAL cancela convite PENDING). */
@Injectable()
export class EndLinkUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly security: SecurityLogger,
  ) {}

  async execute(
    actorUserId: string,
    actorRole: Role,
    linkId: string,
    ctx: LinkAuditContext,
  ) {
    const link = await this.prisma.trainerTraineeLink.findUnique({
      where: { id: linkId },
    });
    if (!link) throw new NotFoundException('Vínculo não encontrado');

    let reason: LinkEndReason;
    if (link.status === LinkStatus.PENDING) {
      if (link.trainerId !== actorUserId) {
        throw new ForbiddenException('Apenas o personal pode cancelar este convite');
      }
      reason = LinkEndReason.TRAINER_CANCELLED;
    } else if (link.status === LinkStatus.ACTIVE) {
      if (link.traineeId === actorUserId) {
        reason = LinkEndReason.TRAINEE_ENDED;
      } else if (link.trainerId === actorUserId) {
        reason = LinkEndReason.TRAINER_ENDED;
      } else {
        throw new ForbiddenException('Você não participa deste vínculo');
      }
    } else {
      throw new BadRequestException('Este vínculo já foi encerrado');
    }

    const updated = await this.prisma.trainerTraineeLink.update({
      where: { id: link.id },
      data: {
        status: LinkStatus.ENDED,
        endedReason: reason,
        endedAt: new Date(),
      },
    });

    await Promise.all([
      this.cache.invalidarUsuario(link.traineeId),
      this.cache.invalidarUsuario(link.trainerId),
      this.cache.invalidarUsuario('all'),
    ]);

    this.security.event('link.ended', {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      userId: link.traineeId,
      actorUserId,
      role: actorRole,
      reason,
      method: 'POST',
      path: `/api/links/${linkId}/end`,
      statusCode: 200,
    });

    return updated;
  }
}
