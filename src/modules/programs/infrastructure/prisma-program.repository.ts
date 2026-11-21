import { Injectable } from '@nestjs/common';
import { Prisma, ProgramStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  AssignmentWithProgram,
  CompletedProgramSession,
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
        await transaction.workout.updateMany({
          where: { programId, id: { notIn: workoutIds } },
          data: { programId: null },
        });
        await this.attachWorkouts(transaction, programId, workoutIds);

        const currentParticipants = await transaction.programAssignment.findMany({
          where: { programId, status: { in: CURRENT_ASSIGNMENT_STATUSES } },
          select: { userId: true },
        });
        await this.assignWorkoutsToUsers(
          transaction,
          workoutIds,
          currentParticipants.map((participant) => participant.userId),
        );
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

  findProgramById(programId: string): Promise<ProgramWithDetails | null> {
    return this.prisma.trainingProgram.findUnique({
      where: { id: programId },
      include: PROGRAM_DETAILS_INCLUDE,
    });
  }

  listPrograms(): Promise<ProgramWithDetails[]> {
    return this.prisma.trainingProgram.findMany({
      orderBy: { createdAt: 'desc' },
      include: PROGRAM_DETAILS_INCLUDE,
    });
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
      where: { userId, status: ProgramStatus.COMPLETED, reportData: { not: Prisma.DbNull } },
      orderBy: { endDate: 'desc' },
      include: ASSIGNMENT_WITH_PROGRAM_INCLUDE,
    });
  }

  async assignProgramToUsers(programId: string, userIds: string[], startDayKey: string): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.programAssignment.createMany({
        data: userIds.map((userId) => ({ programId, userId, startDayKey })),
      });
      const programWorkouts = await transaction.workout.findMany({
        where: { programId },
        select: { id: true },
      });
      await this.assignWorkoutsToUsers(
        transaction,
        programWorkouts.map((workout) => workout.id),
        userIds,
      );
    });
  }

  async archiveAssignment(assignmentId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const archivedAssignment = await transaction.programAssignment.update({
        where: { id: assignmentId },
        data: { status: ProgramStatus.ARCHIVED, endDate: new Date() },
      });
      await transaction.workoutAssignment.deleteMany({
        where: {
          userId: archivedAssignment.userId,
          workout: { programId: archivedAssignment.programId },
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
  ): Promise<CompletedProgramSession[]> {
    if (workoutIds.length === 0) return [];
    const completedLogs = await this.prisma.workoutLog.findMany({
      where: {
        userId,
        completed: true,
        workoutId: { in: workoutIds },
        dayKey: { gte: startDayKey }, // 'YYYY-MM-DD' ordena como texto
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
