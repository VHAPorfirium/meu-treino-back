import { Injectable } from '@nestjs/common';
import { ExerciseStatus, Prisma, Role, WorkoutLog } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  LastPerformanceRecord,
  PrescribedWorkoutExercise,
  UpsertExerciseLogData,
  WorkoutLogRepository,
  WorkoutLogWithEntries,
} from '../domain/workout-log.repository';
import { ExercisePerformanceRecord } from '../domain/exercise-stats-calculator';
import { TraineeActivity } from '../domain/attention-rules';

const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 200;

function clampHistoryLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_HISTORY_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_HISTORY_LIMIT);
}

/** include padrão: logs de exercício com as séries (E4) ordenadas. */
const ENTRIES_INCLUDE = {
  exerciseLogs: { include: { sets: { orderBy: { setNumber: 'asc' as const } } } },
};

const HISTORY_EXERCISE_SELECT = {
  id: true,
  name: true,
  namePt: true,
  equipment: true,
  equipmentPt: true,
};

/** include p/ histórico: joins enxutos de exercício (com namePt, sem blobs de instruções) + séries. */
const HISTORY_INCLUDE = {
  workout: { select: { id: true, name: true, program: { select: { id: true, name: true, type: true } } } },
  user: { select: { id: true, name: true } },
  exerciseLogs: {
    include: {
      workoutExercise: { select: { id: true, exercise: { select: HISTORY_EXERCISE_SELECT } } },
      actualExercise: { select: HISTORY_EXERCISE_SELECT },
      sets: { orderBy: { setNumber: 'asc' as const } },
    },
  },
};

@Injectable()
export class PrismaWorkoutLogRepository implements WorkoutLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSessionOfDay(
    userId: string,
    workoutId: string,
    dayKey: string,
  ): Promise<WorkoutLogWithEntries | null> {
    return this.prisma.workoutLog.findUnique({
      where: { userId_workoutId_dayKey: { userId, workoutId, dayKey } },
      include: ENTRIES_INCLUDE,
    });
  }

  open(
    userId: string,
    workoutId: string,
    dayKey: string,
  ): Promise<WorkoutLogWithEntries> {
    return this.prisma.workoutLog.create({
      data: { userId, workoutId, dayKey },
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
              durationSeconds: s.durationSeconds ?? null,
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

  historyByUser(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<any[]> {
    return this.prisma.workoutLog.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: clampHistoryLimit(opts?.limit),
      skip: Math.max(0, Math.trunc(opts?.offset ?? 0)),
      include: HISTORY_INCLUDE,
    });
  }

  history(opts?: { limit?: number; offset?: number }): Promise<any[]> {
    return this.prisma.workoutLog.findMany({
      orderBy: { date: 'desc' },
      take: clampHistoryLimit(opts?.limit),
      skip: Math.max(0, Math.trunc(opts?.offset ?? 0)),
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

  findAssignedWorkout(
    userId: string,
    workoutId: string,
  ): Promise<{ id: string; active: boolean } | null> {
    return this.prisma.workout.findFirst({
      where: { id: workoutId, assignments: { some: { userId } } },
      select: { id: true, active: true },
    });
  }

  async workoutExerciseBelongsToWorkout(
    workoutId: string,
    workoutExerciseId: string,
  ): Promise<boolean> {
    const found = await this.prisma.workoutExercise.findFirst({
      where: { id: workoutExerciseId, workoutId },
      select: { id: true },
    });
    return Boolean(found);
  }

  async exerciseExists(exerciseId: string): Promise<boolean> {
    const found = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: { id: true },
    });
    return Boolean(found);
  }

  async listPrescribedExercises(workoutId: string): Promise<PrescribedWorkoutExercise[]> {
    const workoutExercises = await this.prisma.workoutExercise.findMany({
      where: { workoutId },
      select: { id: true, exerciseId: true, mode: true, reps: true },
    });
    return workoutExercises.map((workoutExercise) => ({
      workoutExerciseId: workoutExercise.id,
      exerciseId: workoutExercise.exerciseId,
      mode: workoutExercise.mode,
      reps: workoutExercise.reps,
    }));
  }

  async findLastPerformances(
    userId: string,
    exerciseIds: string[],
    beforeDayKey: string,
  ): Promise<LastPerformanceRecord[]> {
    const uniqueExerciseIds = Array.from(new Set(exerciseIds));
    if (uniqueExerciseIds.length === 0) return [];

    // DISTINCT ON por exercício efetivo evita o truncamento silencioso de
    // exercícios antigos quando outros exercícios do mesmo treino têm muitas sessões.
    const latestRows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT ON (COALESCE(wel."actualExerciseId", we."exerciseId"))
        wel."id"
      FROM "WorkoutExerciseLog" wel
      INNER JOIN "WorkoutLog" wl ON wl."id" = wel."workoutLogId"
      INNER JOIN "WorkoutExercise" we ON we."id" = wel."workoutExerciseId"
      WHERE wl."userId" = ${userId}
        AND wl."dayKey" < ${beforeDayKey}
        AND wel."status"::text IN ('DONE', 'REPLACED')
        AND COALESCE(wel."actualExerciseId", we."exerciseId") IN (${Prisma.join(uniqueExerciseIds)})
      ORDER BY COALESCE(wel."actualExerciseId", we."exerciseId"), wl."date" DESC, wel."id" DESC
    `;

    if (latestRows.length === 0) return [];

    const performedLogs = await this.prisma.workoutExerciseLog.findMany({
      where: { id: { in: latestRows.map((row) => row.id) } },
      orderBy: { workoutLog: { date: 'desc' } },
      select: {
        loadUsed: true,
        totalSeconds: true,
        actualExerciseId: true,
        workoutExercise: { select: { exerciseId: true } },
        workoutLog: { select: { date: true } },
        sets: {
          orderBy: { setNumber: 'asc' },
          select: { setNumber: true, weight: true, reps: true, durationSeconds: true },
        },
      },
    });

    const lastPerformanceByExerciseId = new Map<string, LastPerformanceRecord>();
    for (const performedLog of performedLogs) {
      const exerciseId = performedLog.actualExerciseId ?? performedLog.workoutExercise.exerciseId;
      if (lastPerformanceByExerciseId.has(exerciseId)) continue;
      lastPerformanceByExerciseId.set(exerciseId, {
        exerciseId,
        performedAt: performedLog.workoutLog.date,
        loadUsed: performedLog.loadUsed,
        totalSeconds: performedLog.totalSeconds,
        sets: performedLog.sets,
      });
    }
    return [...lastPerformanceByExerciseId.values()];
  }

  async listExercisePerformances(userId: string, exerciseId: string): Promise<ExercisePerformanceRecord[]> {
    const performedLogs = await this.prisma.workoutExerciseLog.findMany({
      where: {
        workoutLog: { userId },
        status: { in: [ExerciseStatus.DONE, ExerciseStatus.REPLACED] },
        OR: [{ actualExerciseId: exerciseId }, { actualExerciseId: null, workoutExercise: { exerciseId } }],
      },
      orderBy: { workoutLog: { date: 'asc' } },
      select: { loadUsed: true, workoutLog: { select: { date: true } }, sets: { select: { weight: true } } },
    });
    return performedLogs.map((performedLog) => {
      const setWeights = performedLog.sets
        .map((performedSet) => performedSet.weight)
        .filter((weight): weight is number => weight !== null);
      return {
        performedAt: performedLog.workoutLog.date,
        heaviestWeight: setWeights.length ? Math.max(...setWeights) : performedLog.loadUsed,
      };
    });
  }

  async listTraineeActivities(skippedSince: Date): Promise<TraineeActivity[]> {
    const trainees = await this.prisma.user.findMany({
      where: { role: Role.TRAINEE },
      select: {
        id: true,
        name: true,
        workoutLogs: { where: { completed: true }, orderBy: { date: 'desc' }, take: 1, select: { date: true } },
      },
    });

    const skippedLogs = await this.prisma.workoutExerciseLog.findMany({
      where: { status: ExerciseStatus.SKIPPED, workoutLog: { date: { gte: skippedSince } } },
      select: {
        workoutLog: { select: { userId: true } },
        workoutExercise: { select: { exercise: { select: { name: true, namePt: true } } } },
      },
    });

    const skippedCountByUserAndExercise = new Map<string, Map<string, number>>();
    for (const skippedLog of skippedLogs) {
      const exerciseName = skippedLog.workoutExercise.exercise.namePt ?? skippedLog.workoutExercise.exercise.name;
      const countByExercise = skippedCountByUserAndExercise.get(skippedLog.workoutLog.userId) ?? new Map<string, number>();
      countByExercise.set(exerciseName, (countByExercise.get(exerciseName) ?? 0) + 1);
      skippedCountByUserAndExercise.set(skippedLog.workoutLog.userId, countByExercise);
    }

    return trainees.map((trainee) => {
      const countByExercise = skippedCountByUserAndExercise.get(trainee.id);
      const mostSkippedEntry = countByExercise
        ? [...countByExercise.entries()].sort((first, second) => second[1] - first[1])[0]
        : undefined;
      return {
        userId: trainee.id,
        userName: trainee.name,
        lastCompletedWorkoutAt: trainee.workoutLogs[0]?.date ?? null,
        mostSkippedExercise: mostSkippedEntry
          ? { exerciseName: mostSkippedEntry[0], skippedCount: mostSkippedEntry[1] }
          : null,
      };
    });
  }
}
