import { ConflictException, NotFoundException } from '@nestjs/common';
import { WorkoutRepository } from '../../domain/workout.repository';
import { DeleteWorkoutUseCase } from './delete-workout.use-case';
import { RemoveWorkoutExerciseUseCase } from './remove-workout-exercise.use-case';

describe('DeleteWorkoutUseCase & RemoveWorkoutExerciseUseCase — corrida P2003 → 409', () => {
  it('DeleteWorkoutUseCase converte P2003 sob corrida em 409 ConflictException', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({ id: 'w1' }),
      countLogs: jest.fn().mockResolvedValue(0),
      delete: jest.fn().mockRejectedValue({ code: 'P2003' }),
    } as unknown as WorkoutRepository;

    const useCase = new DeleteWorkoutUseCase(repo);
    await expect(useCase.execute('w1')).rejects.toThrow(ConflictException);
  });

  it('DeleteWorkoutUseCase converte P2025 sob corrida em 404 NotFoundException', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({ id: 'w1' }),
      countLogs: jest.fn().mockResolvedValue(0),
      delete: jest.fn().mockRejectedValue({ code: 'P2025' }),
    } as unknown as WorkoutRepository;

    const useCase = new DeleteWorkoutUseCase(repo);
    await expect(useCase.execute('w1')).rejects.toThrow(NotFoundException);
  });

  it('RemoveWorkoutExerciseUseCase converte P2003 sob corrida em 409 ConflictException', async () => {
    const repo = {
      findExerciseInWorkout: jest.fn().mockResolvedValue({ id: 'we1', workoutId: 'w1' }),
      countExerciseLogs: jest.fn().mockResolvedValue(0),
      removeExerciseAndReindex: jest.fn().mockRejectedValue({ code: 'P2003' }),
    } as unknown as WorkoutRepository;

    const useCase = new RemoveWorkoutExerciseUseCase(repo);
    await expect(useCase.execute('w1', 'we1')).rejects.toThrow(ConflictException);
  });

  it('RemoveWorkoutExerciseUseCase converte P2025 sob corrida em 404 NotFoundException', async () => {
    const repo = {
      findExerciseInWorkout: jest.fn().mockResolvedValue({ id: 'we1', workoutId: 'w1' }),
      countExerciseLogs: jest.fn().mockResolvedValue(0),
      removeExerciseAndReindex: jest.fn().mockRejectedValue({ code: 'P2025' }),
    } as unknown as WorkoutRepository;

    const useCase = new RemoveWorkoutExerciseUseCase(repo);
    await expect(useCase.execute('w1', 'we1')).rejects.toThrow(NotFoundException);
  });
});
