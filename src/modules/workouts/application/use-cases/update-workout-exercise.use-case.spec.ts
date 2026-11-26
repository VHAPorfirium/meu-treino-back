import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ExerciseMode } from '@prisma/client';
import { WorkoutRepository } from '../../domain/workout.repository';
import { TodayWorkoutQueryDto } from '../dto/today-workout.query';
import { CreateWorkoutDto } from '../dto/create-workout.dto';
import { UpdateWorkoutExerciseUseCase } from './update-workout-exercise.use-case';

describe('UpdateWorkoutExerciseUseCase & Workout DTOs', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  it('rejeita troca para TIME sem durationSeconds válido', async () => {
    const repo = {
      findExerciseInWorkout: jest.fn().mockResolvedValue({
        id: 'we-1',
        mode: ExerciseMode.REPS,
        reps: '10-12',
        durationSeconds: null,
      }),
      updateExercise: jest.fn(),
    } as unknown as jest.Mocked<WorkoutRepository>;

    const useCase = new UpdateWorkoutExerciseUseCase(repo);
    await expect(
      useCase.execute('w1', 'we-1', { mode: ExerciseMode.TIME }),
    ).rejects.toThrow(BadRequestException);
    expect(repo.updateExercise).not.toHaveBeenCalled();
  });

  it('limpa reps ao migrar para TIME com durationSeconds', async () => {
    const repo = {
      findExerciseInWorkout: jest.fn().mockResolvedValue({
        id: 'we-1',
        mode: ExerciseMode.REPS,
        reps: '10-12',
        durationSeconds: null,
      }),
      updateExercise: jest.fn().mockResolvedValue({ id: 'we-1' }),
    } as unknown as jest.Mocked<WorkoutRepository>;

    const useCase = new UpdateWorkoutExerciseUseCase(repo);
    await useCase.execute('w1', 'we-1', { mode: ExerciseMode.TIME, durationSeconds: 600 });

    expect(repo.updateExercise).toHaveBeenCalledWith(
      'we-1',
      expect.objectContaining({
        mode: ExerciseMode.TIME,
        reps: null,
        durationSeconds: 600,
      }),
    );
  });

  it('limpa durationSeconds ao migrar para REPS com reps válidas', async () => {
    const repo = {
      findExerciseInWorkout: jest.fn().mockResolvedValue({
        id: 'we-1',
        mode: ExerciseMode.TIME,
        reps: null,
        durationSeconds: 600,
      }),
      updateExercise: jest.fn().mockResolvedValue({ id: 'we-1' }),
    } as unknown as jest.Mocked<WorkoutRepository>;

    const useCase = new UpdateWorkoutExerciseUseCase(repo);
    await useCase.execute('w1', 'we-1', { mode: ExerciseMode.REPS, reps: '12' });

    expect(repo.updateExercise).toHaveBeenCalledWith(
      'we-1',
      expect.objectContaining({
        mode: ExerciseMode.REPS,
        reps: '12',
        durationSeconds: null,
      }),
    );
  });

  it('rejeita dayOfWeek inválido (NaN ou fora de 0..6) e nome só com espaços', async () => {
    await expect(
      pipe.transform({ dayOfWeek: 'abc' }, { type: 'query', metatype: TodayWorkoutQueryDto }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      pipe.transform({ dayOfWeek: '9' }, { type: 'query', metatype: TodayWorkoutQueryDto }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      pipe.transform({ name: '   ' }, { type: 'body', metatype: CreateWorkoutDto }),
    ).rejects.toThrow(BadRequestException);
  });
});
