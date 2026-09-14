import { Injectable } from '@nestjs/common';
import { WorkoutLog } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  UpsertExerciseLogData,
  WorkoutLogRepository,
  WorkoutLogWithEntries,
} from '../domain/workout-log.repository';

/** include padrão: logs de exercício com as séries (E4) ordenadas. */
const ENTRIES_INCLUDE = {
  exerciseLogs: { include: { sets: { orderBy: { setNumber: 'asc' as const } } } },
};

/** include p/ histórico: joins de exercício + séries. */
const HISTORY_INCLUDE = {
  workout: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
  exerciseLogs: {
    include: {
      workoutExercise: { include: { exercise: true } },
      actualExercise: { select: { id: true, name: true, equipment: true } },
      sets: { orderBy: { setNumber: 'asc' as const } },
    },
  },
};

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
      include: ENTRIES_INCLUDE,
      orderBy: { date: 'desc' },
    });
  }

  open(userId: string, workoutId: string): Promise<WorkoutLogWithEntries> {
    return this.prisma.workoutLog.create({
      data: { userId, workoutId },
      include: ENTRIES_INCLUDE,
    });
  }

  findById(id: string): Promise<WorkoutLog | null> {
    return this.prisma.workoutLog.findUnique({ where: { id } });
  }

  /**
   * Upsert do registro do exercício. Se `sets` vier, faz REPLACE das séries
   * (apaga e recria) na mesma transação — idempotente por construção.
   */
  async upsertExerciseLog(
    workoutLogId: string,
    workoutExerciseId: string,
    data: UpsertExerciseLogData,
  ): Promise<void> {
    const { sets, ...fields } = data;
    await this.prisma.$transaction(async (tx) => {
      const log = await tx.workoutExerciseLog.upsert({
        where: {
          workoutLogId_workoutExerciseId: { workoutLogId, workoutExerciseId },
        },
        create: { workoutLogId, workoutExerciseId, ...fields },
        update: { ...fields },
      });
      if (sets !== undefined) {
        await tx.setLog.deleteMany({ where: { workoutExerciseLogId: log.id } });
        if (sets.length) {
          await tx.setLog.createMany({
            data: sets.map((s) => ({
              workoutExerciseLogId: log.id,
              setNumber: s.setNumber,
              weight: s.weight ?? null,
              reps: s.reps ?? null,
            })),
          });
        }
      }
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
      include: HISTORY_INCLUDE,
    });
  }

  history(): Promise<any[]> {
    return this.prisma.workoutLog.findMany({
      orderBy: { date: 'desc' },
      include: HISTORY_INCLUDE,
    });
  }

  allExerciseLogs(since?: Date): Promise<any[]> {
    return this.prisma.workoutExerciseLog.findMany({
      where: since ? { workoutLog: { date: { gte: since } } } : undefined,
      include: {
        workoutLog: { select: { date: true } },
        workoutExercise: { include: { exercise: true } },
        actualExercise: { select: { id: true, name: true } },
        sets: true,
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
