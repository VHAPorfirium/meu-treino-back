import { Inject, Injectable } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

@Injectable()
export class GetTodayWorkoutUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(userId: string, dayOfWeekOverride?: number) {
    const dayOfWeek = dayOfWeekOverride ?? new Date().getDay();
    const workout = await this.repo.findTodayWorkout(dayOfWeek);

    if (!workout) return { workout: null, workoutLog: null };

    const exerciseIds = workout.exercises.map((we) => we.exerciseId);
    const altMap = await this.repo.findAlternativesForExercises(exerciseIds);

    // sessão aberta de hoje (não finalizada), se existir
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const openLog = await this.prisma.workoutLog.findFirst({
      where: {
        userId,
        workoutId: workout.id,
        completed: false,
        date: { gte: startOfDay },
      },
      include: { exerciseLogs: true },
      orderBy: { date: 'desc' },
    });

    return {
      workoutLog: openLog,
      workout: {
        id: workout.id,
        name: workout.name,
        dayOfWeek: workout.dayOfWeek,
        exercises: workout.exercises.map((we) => ({
          id: we.id,
          order: we.order,
          sets: we.sets,
          reps: we.reps,
          restSeconds: we.restSeconds,
          notes: we.notes,
          exercise: {
            id: we.exercise.id,
            name: we.exercise.name,
            target: we.exercise.target,
            bodyPart: we.exercise.bodyPart,
            equipment: we.exercise.equipment,
            gifUrl: we.exercise.gifUrl,
            thumbnailUrl: we.exercise.thumbnailUrl,
            instructions: we.exercise.instructions,
          },
          alternatives: altMap[we.exerciseId] ?? [],
        })),
      },
    };
  }
}
