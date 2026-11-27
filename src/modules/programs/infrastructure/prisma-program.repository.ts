import { Injectable } from '@nestjs/common';
import { Prisma, ProgramStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  AssignmentWithProgram,
  CompletedProgramSession,
  CompletedProgramSessionDay,
  CreateProgramData,
  CURRENT_ASSIGNMENT_STATUSES,
  PROGRAM_WORKOUT_SELECT,
  ProgramRepository,
  ProgramWithDetails,
  UpdateProgramData,
} from '../domain/program.repository';
import { ProgramReport } from '../domain/program-report';

const PROGRAM_DETAILS_INCLUDE = {
  workouts: { select: PROGRAM_WORKOUT_SELECT, orderBy: [{ dayOfWeek: 'asc' }, { createdAt: 'asc' }] },
  assignments: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { startDate: 'desc' },
  },
} satisfies Prisma.TrainingProgramInclude;

const ASSIGNMENT_WITH_PROGRAM_INCLUDE = {
  program: {
    include: {
      workouts: { select: PROGRAM_WORKOUT_SELECT, orderBy: [{ dayOfWeek: 'asc' }, { createdAt: 'asc' }] },
    },
  },
} satisfies Prisma.ProgramAssignmentInclude;

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class PrismaProgramRepository implements ProgramRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createProgram(programData: CreateProgramData): Promise<ProgramWithDetails> {
    const { workoutIds, ...programFields } = programData;
    return this.prisma.$transaction(async (transaction) => {
      const createdProgram = await transaction.trainingProgram.create({ data: programFields });
      await this.attachWorkouts(transaction, createdProgram.id, workoutIds);
      return transaction.trainingProgram.findUniqueOrThrow({
        where: { id: createdProgram.id },
        include: PROGRAM_DETAILS_INCLUDE,
      });
    });
  }

  async updateProgram(programId: string, programData: UpdateProgramData): Promise<ProgramWithDetails> {
    const { workoutIds, ...programFields } = programData;
    return this.prisma.$transaction(async (transaction) => {
      await transaction.trainingProgram.update({ where: { id: programId }, data: programFields });

      if (workoutIds) {
        const removedWorkouts = await transaction.workout.findMany({
          where: { programId, id: { notIn: workoutIds } },
          select: { id: true },
        });
        const removedWorkoutIds = removedWorkouts.map((workout) => workout.id);

        if (removedWorkoutIds.length > 0) {
          await transaction.workout.updateMany({
            where: { id: { in: removedWorkoutIds } },
            data: { programId: null },
          });
        }
        await this.attachWorkouts(transaction, programId, workoutIds);

        // Só participantes ATIVOS (e ainda vinculados, quando `allowedUserIds` é informado)
        // recebem/perdem treinos do programa; quem já concluiu (COMPLETED) ou encerrou vínculo
        // não é afetado retroativamente.
        const activeParticipants = await transaction.programAssignment.findMany({
          where: { programId, status: ProgramStatus.ACTIVE },
          select: { userId: true },
        });
        const allowedSet = programData.allowedUserIds
          ? new Set(programData.allowedUserIds)
          : null;
        const activeUserIds = activeParticipants
          .map((participant) => participant.userId)
          .filter((uid) => !allowedSet || allowedSet.has(uid));

        if (removedWorkoutIds.length > 0 && activeUserIds.length > 0) {
          await transaction.workoutAssignment.deleteMany({
            where: {
              workoutId: { in: removedWorkoutIds },
              userId: { in: activeUserIds },
            },
          });
        }

        await this.assignWorkoutsToUsers(transaction, workoutIds, activeUserIds);
      }

      return transaction.trainingProgram.findUniqueOrThrow({
        where: { id: programId },
        include: PROGRAM_DETAILS_INCLUDE,
      });
    });
  }

  async deleteProgram(programId: string): Promise<void> {
    // Workout.programId vira null (SetNull) e as participações somem (Cascade):
    // os treinos continuam existindo e direcionados como estavam.
    await this.prisma.trainingProgram.delete({ where: { id: programId } });
  }

  async detachProgramOwner(programId: string): Promise<void> {
    await this.prisma.trainingProgram.update({
      where: { id: programId },
      data: { ownerTrainerId: null },
    });
  }

  findProgramById(programId: string): Promise<ProgramWithDetails | null> {
    return this.prisma.trainingProgram.findUnique({
      where: { id: programId },
      include: PROGRAM_DETAILS_INCLUDE,
    });
  }

  listPrograms(ownerTrainerId?: string): Promise<ProgramWithDetails[]> {
    return this.prisma.trainingProgram.findMany({
      where: ownerTrainerId ? { ownerTrainerId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: PROGRAM_DETAILS_INCLUDE,
    });
  }

  async findExistingWorkoutIds(
    workoutIds: string[],
    ownerTrainerId?: string,
  ): Promise<string[]> {
    if (workoutIds.length === 0) return [];
    const found = await this.prisma.workout.findMany({
      where: {
        id: { in: workoutIds },
        ...(ownerTrainerId ? { ownerTrainerId } : {}),
      },
      select: { id: true },
    });
    return found.map((w) => w.id);
  }

  findCurrentAssignmentByUser(userId: string): Promise<AssignmentWithProgram | null> {
    return this.prisma.programAssignment.findFirst({
      where: { userId, status: { in: CURRENT_ASSIGNMENT_STATUSES } },
      orderBy: { startDate: 'desc' },
      include: ASSIGNMENT_WITH_PROGRAM_INCLUDE,
    });
  }

  findAssignmentById(assignmentId: string): Promise<AssignmentWithProgram | null> {
    return this.prisma.programAssignment.findUnique({
      where: { id: assignmentId },
      include: ASSIGNMENT_WITH_PROGRAM_INCLUDE,
    });
  }

  listCompletedAssignmentsByUser(userId: string): Promise<AssignmentWithProgram[]> {
    return this.prisma.programAssignment.findMany({
      where: {
        userId,
        // Conquistas permanecem visíveis mesmo depois que um programa concluído
        // é arquivado (ao encerrar da home ou ao atribuir um novo programa).
        status: { in: [ProgramStatus.COMPLETED, ProgramStatus.ARCHIVED] },
        reportData: { not: Prisma.DbNull },
      },
      orderBy: { endDate: 'desc' },
      include: ASSIGNMENT_WITH_PROGRAM_INCLUDE,
    });
  }

  async assignProgramToUsers(
    programId: string,
    userIds: string[],
    startDayKey: string,
  ): Promise<string[]> {
    const sortedUserIds = Array.from(new Set(userIds)).sort();
    if (sortedUserIds.length === 0) return [];

    return this.prisma.$transaction(async (transaction) => {
      // Serializa atribuições concorrentes para o mesmo aluno em ordem determinística
      // (evita deadlock e impede duas participações ACTIVE simultâneas).
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(sortedUserIds)}) ORDER BY "id" FOR UPDATE`,
      );

      const currentAssignments = await transaction.programAssignment.findMany({
        where: {
          userId: { in: sortedUserIds },
          status: { in: CURRENT_ASSIGNMENT_STATUSES },
        },
        select: {
          id: true,
          userId: true,
          programId: true,
          status: true,
          endDate: true,
        },
      });

      const assignmentsByUser = new Map<string, typeof currentAssignments>();
      for (const assignment of currentAssignments) {
        const list = assignmentsByUser.get(assignment.userId) ?? [];
        list.push(assignment);
        assignmentsByUser.set(assignment.userId, list);
      }

      const now = new Date();
      const newParticipantIds: string[] = [];

      for (const userId of sortedUserIds) {
        const userAssignments = assignmentsByUser.get(userId) ?? [];
        const alreadyActiveHere = userAssignments.some(
          (assignment) =>
            assignment.programId === programId &&
            assignment.status === ProgramStatus.ACTIVE,
        );

        const toArchive = alreadyActiveHere
          ? userAssignments.filter(
              (assignment) =>
                !(
                  assignment.programId === programId &&
                  assignment.status === ProgramStatus.ACTIVE
                ),
            )
          : userAssignments;

        for (const assignment of toArchive) {
          await transaction.programAssignment.update({
            where: { id: assignment.id },
            data: {
              status: ProgramStatus.ARCHIVED,
              // Preserva a data original de conclusão (COMPLETED) da medalha.
              endDate: assignment.endDate ?? now,
            },
          });
          await transaction.workoutAssignment.deleteMany({
            where: {
              userId: assignment.userId,
              workout: { programId: assignment.programId },
            },
          });
        }

        if (!alreadyActiveHere) {
          newParticipantIds.push(userId);
        }
      }

      if (newParticipantIds.length === 0) return [];

      await transaction.programAssignment.createMany({
        data: newParticipantIds.map((userId) => ({ programId, userId, startDayKey })),
      });
      const programWorkouts = await transaction.workout.findMany({
        where: { programId },
        select: { id: true },
      });
      await this.assignWorkoutsToUsers(
        transaction,
        programWorkouts.map((workout) => workout.id),
        newParticipantIds,
      );

      return newParticipantIds;
    });
  }

  async archiveAssignment(assignmentId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const existingAssignment = await transaction.programAssignment.findUniqueOrThrow({
        where: { id: assignmentId },
        select: { id: true, userId: true, programId: true, endDate: true },
      });
      await transaction.programAssignment.update({
        where: { id: assignmentId },
        data: {
          status: ProgramStatus.ARCHIVED,
          // Preserva a data original de conclusão (COMPLETED) para não corromper
          // o `completedAt` da medalha no histórico de conquistas.
          endDate: existingAssignment.endDate ?? new Date(),
        },
      });
      await transaction.workoutAssignment.deleteMany({
        where: {
          userId: existingAssignment.userId,
          workout: { programId: existingAssignment.programId },
        },
      });
    });
  }

  async markAssignmentCompleted(assignmentId: string, programReport: ProgramReport): Promise<void> {
    await this.prisma.programAssignment.update({
      where: { id: assignmentId },
      data: {
        status: ProgramStatus.COMPLETED,
        endDate: new Date(programReport.completedAt),
        reportData: programReport as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async listCompletedSessionsSince(
    userId: string,
    workoutIds: string[],
    startDayKey: string,
    assignmentId?: string,
  ): Promise<CompletedProgramSession[]> {
    if (workoutIds.length === 0 && !assignmentId) return [];
    const matchClauses: Prisma.WorkoutLogWhereInput[] = [];
    if (assignmentId) matchClauses.push({ programAssignmentId: assignmentId });
    if (workoutIds.length > 0) matchClauses.push({ workoutId: { in: workoutIds } });

    const completedLogs = await this.prisma.workoutLog.findMany({
      where: {
        userId,
        completed: true,
        dayKey: { gte: startDayKey }, // 'YYYY-MM-DD' ordena como texto
        OR: matchClauses,
      },
      orderBy: { date: 'asc' },
      select: {
        dayKey: true,
        exerciseLogs: {
          select: {
            loadUsed: true,
            actualExerciseId: true,
            workoutExercise: { select: { exerciseId: true } },
          },
        },
      },
    });

    return completedLogs.map((completedLog) => ({
      dayKey: completedLog.dayKey,
      exerciseLoads: completedLog.exerciseLogs
        .filter((exerciseLog) => exerciseLog.loadUsed != null)
        .map((exerciseLog) => ({
          exerciseId: exerciseLog.actualExerciseId ?? exerciseLog.workoutExercise.exerciseId,
          load: exerciseLog.loadUsed as number,
        })),
    }));
  }

  async listCompletedSessionDaysForUsers(
    userIds: string[],
    workoutIds: string[],
    minStartDayKey: string,
    assignmentIds?: string[],
  ): Promise<CompletedProgramSessionDay[]> {
    const hasAssignments = Boolean(assignmentIds && assignmentIds.length > 0);
    if (userIds.length === 0 || (workoutIds.length === 0 && !hasAssignments)) return [];

    const matchClauses: Prisma.WorkoutLogWhereInput[] = [];
    if (hasAssignments) matchClauses.push({ programAssignmentId: { in: assignmentIds } });
    if (workoutIds.length > 0) matchClauses.push({ workoutId: { in: workoutIds } });

    return this.prisma.workoutLog.findMany({
      where: {
        userId: { in: userIds },
        completed: true,
        dayKey: { gte: minStartDayKey },
        OR: matchClauses,
      },
      select: {
        userId: true,
        workoutId: true,
        dayKey: true,
        programAssignmentId: true,
      },
    });
  }

  // ── auxiliares ─────────────────────────────────────────────────────────────

  private async attachWorkouts(transaction: TransactionClient, programId: string, workoutIds: string[]) {
    if (workoutIds.length === 0) return;
    await transaction.workout.updateMany({
      where: { id: { in: workoutIds } },
      data: { programId },
    });
  }

  private async assignWorkoutsToUsers(
    transaction: TransactionClient,
    workoutIds: string[],
    userIds: string[],
  ) {
    if (workoutIds.length === 0 || userIds.length === 0) return;
    await transaction.workoutAssignment.createMany({
      data: workoutIds.flatMap((workoutId) => userIds.map((userId) => ({ workoutId, userId }))),
      skipDuplicates: true,
    });
  }
}
