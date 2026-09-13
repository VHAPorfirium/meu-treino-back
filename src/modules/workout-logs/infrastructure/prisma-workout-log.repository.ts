import { Injectable } from '@nestjs/common';
import { WorkoutLog } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  UpsertExerciseLogData,
  WorkoutLogRepository,
  WorkoutLogWithEntries,
} from '../domain/workout-log.repository';

@Injectable()
export class PrismaWorkoutLogRepository implements WorkoutLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOpenSession(
    userId: string,
    workoutId: string,
    since: Date,
  ): Promise<WorkoutLogWithEntries | null> {
    return this.prisma.workoutLog.findFirst({
      where: { userId, workoutId, completed: false, date: { gte: since } },
      include: { exerciseLogs: true },
      orderBy: { date: 'desc' },
    });
  }

  open(userId: string, workoutId: string): Promise<WorkoutLogWithEntries> {
    return this.prisma.workoutLog.create({
      data: { userId, workoutId },
      include: { exerciseLogs: true },
    });
  }

  findById(id: string): Promise<WorkoutLog | null> {
    return this.prisma.workoutLog.findUnique({ where: { id } });
  }

  async upsertExerciseLog(
    workoutLogId: string,
    workoutExerciseId: string,
    data: UpsertExerciseLogData,
  ): Promise<void> {
    await this.prisma.workoutExerciseLog.upsert({
      where: {
        workoutLogId_workoutExerciseId: { workoutLogId, workoutExerciseId },
      },
      create: { workoutLogId, workoutExerciseId, ...data },
      update: { ...data },
    });
  }

  complete(id: string): Promise<WorkoutLog> {
    return this.prisma.workoutLog.update({
      where: { id },
      data: { completed: true },
    });
  }

  historyByUser(userId: string): Promise<any[]> {
    return this.prisma.workoutLog.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      include: {
        workout: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        exerciseLogs: {
          include: {
            workoutExercise: { include: { exercise: true } },
            actualExercise: {
              select: { id: true, name: true, equipment: true },
            },
          },
        },
      },
    });
  }

  history(): Promise<any[]> {
    return this.prisma.workoutLog.findMany({
      orderBy: { date: 'desc' },
      include: {
        workout: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        exerciseLogs: {
          include: {
            workoutExercise: { include: { exercise: true } },
            actualExercise: {
              select: { id: true, name: true, equipment: true },
            },
          },
        },
      },
    });
  }

  allExerciseLogs(since?: Date): Promise<any[]> {
    return this.prisma.workoutExerciseLog.findMany({
      where: since ? { workoutLog: { date: { gte: since } } } : undefined,
      include: {
        workoutLog: { select: { date: true } },
        workoutExercise: { include: { exercise: true } },
        actualExercise: { select: { id: true, name: true } },
      },
      orderBy: { workoutLog: { date: 'asc' } },
    });
  }

  countSessions(since: Date): Promise<number> {
    return this.prisma.workoutLog.count({
      where: { completed: true, date: { gte: since } },
    });
  }
}
