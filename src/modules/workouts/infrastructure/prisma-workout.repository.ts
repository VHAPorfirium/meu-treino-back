import { Injectable } from '@nestjs/common';
import { Workout, WorkoutExercise } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  WorkoutRepository,
  WorkoutWithExercises,
} from '../domain/workout.repository';

@Injectable()
export class PrismaWorkoutRepository implements WorkoutRepository {
  constructor(private readonly prisma: PrismaService) {}

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
    data: {
      exerciseId: string;
      order: number;
      sets: number;
      reps: string;
      restSeconds?: number;
      notes?: string;
    },
  ): Promise<WorkoutExercise> {
    return this.prisma.workoutExercise.create({
      data: { workoutId, ...data },
    });
  }

  findById(id: string): Promise<Workout | null> {
    return this.prisma.workout.findUnique({ where: { id } });
  }

  listAll(): Promise<any[]> {
    return this.prisma.workout.findMany({
      orderBy: [{ active: 'desc' }, { dayOfWeek: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { exercises: true } } },
    });
  }

  findByIdWithExercises(id: string): Promise<WorkoutWithExercises | null> {
    return this.prisma.workout.findUnique({
      where: { id },
      include: {
        exercises: { include: { exercise: true }, orderBy: { order: 'asc' } },
      },
    });
  }

  async findTodayWorkout(
    dayOfWeek: number,
  ): Promise<WorkoutWithExercises | null> {
    const byDay = await this.prisma.workout.findFirst({
      where: { active: true, dayOfWeek },
      include: {
        exercises: { include: { exercise: true }, orderBy: { order: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (byDay) return byDay;

    // fallback: primeiro treino ativo (dia sem treino específico)
    return this.prisma.workout.findFirst({
      where: { active: true },
      include: {
        exercises: { include: { exercise: true }, orderBy: { order: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
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

    const map: Record<string, typeof rows[number]['alt'][]> = {};
    for (const r of rows) {
      (map[r.baseExerciseId] ??= []).push(r.alt);
    }
    return map;
  }
}
