import { Injectable } from '@nestjs/common';
import { Workout, WorkoutExercise } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  AssigneeSummary,
  WorkoutExerciseData,
  WorkoutRepository,
  WorkoutWithExercises,
} from '../domain/workout.repository';

/** include padrão de um treino "completo" (exercícios ordenados + destinatários). */
const FULL_INCLUDE = {
  exercises: { include: { exercise: true }, orderBy: { order: 'asc' as const } },
  assignments: { include: { user: { select: { id: true, name: true } } } },
};

@Injectable()
export class PrismaWorkoutRepository implements WorkoutRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── criação / leitura ──────────────────────────────────────────────────────

  create(data: {
    name: string;
    dayOfWeek?: number;
    active?: boolean;
  }): Promise<Workout> {
    return this.prisma.workout.create({
      data: {
        name: data.name,
        dayOfWeek: data.dayOfWeek,
        active: data.active ?? true,
      },
    });
  }

  addExercise(
    workoutId: string,
    data: WorkoutExerciseData,
  ): Promise<WorkoutExercise> {
    return this.prisma.workoutExercise.create({
      data: { workoutId, ...data },
    });
  }

  findById(id: string): Promise<Workout | null> {
    return this.prisma.workout.findUnique({ where: { id } });
  }

  async listAll(): Promise<any[]> {
    const rows = await this.prisma.workout.findMany({
      orderBy: [{ active: 'desc' }, { dayOfWeek: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { exercises: true } },
        assignments: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    return rows.map(({ assignments, ...w }) => ({
      ...w,
      assignees: assignments.map((a) => a.user),
    }));
  }

  findByIdWithExercises(id: string): Promise<WorkoutWithExercises | null> {
    return this.prisma.workout.findUnique({
      where: { id },
      include: FULL_INCLUDE,
    });
  }

  async findAlternativesForExercises(exerciseIds: string[]) {
    if (exerciseIds.length === 0) return {};
    const rows = await this.prisma.exerciseAlternative.findMany({
      where: { baseExerciseId: { in: exerciseIds } },
      include: {
        alt: {
          select: {
            id: true,
            name: true,
            equipment: true,
            gifUrl: true,
            thumbnailUrl: true,
          },
        },
      },
      orderBy: { alt: { name: 'asc' } },
    });

    const map: Record<string, (typeof rows)[number]['alt'][]> = {};
    for (const r of rows) {
      (map[r.baseExerciseId] ??= []).push(r.alt);
    }
    return map;
  }

  // ── E1: CRUD ───────────────────────────────────────────────────────────────

  update(
    id: string,
    data: { name?: string; dayOfWeek?: number | null; active?: boolean },
  ): Promise<Workout> {
    return this.prisma.workout.update({ where: { id }, data });
  }

  countLogs(workoutId: string): Promise<number> {
    return this.prisma.workoutLog.count({ where: { workoutId } });
  }

  async delete(id: string): Promise<void> {
    // exercícios e assignments caem em cascata (schema)
    await this.prisma.workout.delete({ where: { id } });
  }

  findExerciseInWorkout(
    workoutId: string,
    workoutExerciseId: string,
  ): Promise<WorkoutExercise | null> {
    return this.prisma.workoutExercise.findFirst({
      where: { id: workoutExerciseId, workoutId },
    });
  }

  updateExercise(
    workoutExerciseId: string,
    data: {
      sets?: number;
      reps?: string;
      restSeconds?: number | null;
      notes?: string | null;
    },
  ): Promise<WorkoutExercise> {
    return this.prisma.workoutExercise.update({
      where: { id: workoutExerciseId },
      data,
    });
  }

  countExerciseLogs(workoutExerciseId: string): Promise<number> {
    return this.prisma.workoutExerciseLog.count({
      where: { workoutExerciseId },
    });
  }

  async removeExerciseAndReindex(
    workoutId: string,
    workoutExerciseId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.workoutExercise.delete({ where: { id: workoutExerciseId } });
      const rest = await tx.workoutExercise.findMany({
        where: { workoutId },
        orderBy: { order: 'asc' },
        select: { id: true },
      });
      // `order` é 1-based no projeto (AddExerciseDto exige >= 1)
      await Promise.all(
        rest.map((we, i) =>
          tx.workoutExercise.update({ where: { id: we.id }, data: { order: i + 1 } }),
        ),
      );
    });
  }

  // ── E1.1: direcionamento ───────────────────────────────────────────────────

  async setAssignees(
    workoutId: string,
    userIds: string[],
  ): Promise<AssigneeSummary[]> {
    const unique = Array.from(new Set(userIds));
    await this.prisma.$transaction(async (tx) => {
      await tx.workoutAssignment.deleteMany({
        where: { workoutId, userId: { notIn: unique } },
      });
      if (unique.length) {
        await tx.workoutAssignment.createMany({
          data: unique.map((userId) => ({ workoutId, userId })),
          skipDuplicates: true,
        });
      }
    });
    const rows = await this.prisma.workoutAssignment.findMany({
      where: { workoutId },
      include: { user: { select: { id: true, name: true } } },
    });
    return rows.map((r) => r.user);
  }

  findAssignedActiveByDay(
    userId: string,
    dayOfWeek: number,
  ): Promise<WorkoutWithExercises | null> {
    return this.prisma.workout.findFirst({
      where: { active: true, dayOfWeek, assignments: { some: { userId } } },
      include: FULL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findFirstAssignedActive(userId: string): Promise<WorkoutWithExercises | null> {
    return this.prisma.workout.findFirst({
      where: { active: true, assignments: { some: { userId } } },
      include: FULL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  listAssigned(userId: string): Promise<any[]> {
    return this.prisma.workout.findMany({
      where: { assignments: { some: { userId } } },
      orderBy: [{ active: 'desc' }, { dayOfWeek: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { exercises: true } } },
    });
  }

  // ── E2: reordenar / duplicar ───────────────────────────────────────────────

  async reorder(
    workoutId: string,
    items: { workoutExerciseId: string; order: number }[],
  ): Promise<void> {
    await this.prisma.$transaction(
      items.map((it) =>
        this.prisma.workoutExercise.update({
          where: { id: it.workoutExerciseId },
          data: { order: it.order },
        }),
      ),
    );
  }

  async duplicate(
    id: string,
    opts: { name: string; copyAssignees: boolean },
  ): Promise<Workout> {
    return this.prisma.$transaction(async (tx) => {
      const src = await tx.workout.findUniqueOrThrow({
        where: { id },
        include: { exercises: true, assignments: true },
      });
      const copy = await tx.workout.create({
        data: { name: opts.name, dayOfWeek: null, active: true },
      });
      if (src.exercises.length) {
        await tx.workoutExercise.createMany({
          data: src.exercises.map((we) => ({
            workoutId: copy.id,
            exerciseId: we.exerciseId,
            order: we.order,
            sets: we.sets,
            reps: we.reps,
            restSeconds: we.restSeconds,
            notes: we.notes,
          })),
        });
      }
      if (opts.copyAssignees && src.assignments.length) {
        await tx.workoutAssignment.createMany({
          data: src.assignments.map((a) => ({
            workoutId: copy.id,
            userId: a.userId,
          })),
        });
      }
      return copy;
    });
  }
}
