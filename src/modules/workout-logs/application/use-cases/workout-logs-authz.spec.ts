import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ExerciseMode, ExerciseStatus } from '@prisma/client';
import { CacheService } from '../../../../shared/cache/cache.service';
import { WorkoutLogRepository } from '../../domain/workout-log.repository';
import { LastPerformanceQueryDto } from '../dto/last-performance.query';
import { OpenSessionUseCase } from './open-session.use-case';
import { PatchExerciseLogUseCase } from './patch-exercise-log.use-case';
import { GetLastPerformanceUseCase } from './get-last-performance.use-case';

function mockRepo(): jest.Mocked<WorkoutLogRepository> {
  return {
    findSessionOfDay: jest.fn(),
    open: jest.fn(),
    findById: jest.fn(),
    upsertExerciseLog: jest.fn(),
    complete: jest.fn(),
    history: jest.fn(),
    historyByUser: jest.fn(),
    listPrescribedExercises: jest.fn(),
    findLastPerformances: jest.fn(),
    listExercisePerformances: jest.fn(),
    findAssignedWorkout: jest.fn(),
    workoutExerciseBelongsToWorkout: jest.fn(),
    exerciseExists: jest.fn(),
    listTraineeActivities: jest.fn(),
  } as unknown as jest.Mocked<WorkoutLogRepository>;
}

describe('WorkoutLogs — autorização e validação', () => {
  describe('OpenSessionUseCase', () => {
    const makeCache = () =>
      ({ invalidarUsuario: jest.fn().mockResolvedValue(1) }) as unknown as jest.Mocked<CacheService>;

    it('rejeita (404) quando o treino não pertence ao usuário ou não existe', async () => {
      const repo = mockRepo();
      repo.findAssignedWorkout.mockResolvedValue(null);
      const useCase = new OpenSessionUseCase(repo, makeCache());

      await expect(useCase.execute('aluna-1', 'treino-alheio')).rejects.toThrow(NotFoundException);
      expect(repo.open).not.toHaveBeenCalled();
    });

    it('rejeita (400) quando o treino está inativo e ainda não há sessão no dia', async () => {
      const repo = mockRepo();
      repo.findAssignedWorkout.mockResolvedValue({ id: 'w1', active: false });
      repo.findSessionOfDay.mockResolvedValue(null);
      const useCase = new OpenSessionUseCase(repo, makeCache());

      await expect(useCase.execute('aluna-1', 'w1')).rejects.toThrow(BadRequestException);
      expect(repo.open).not.toHaveBeenCalled();
    });

    it('rejeita (409) se a sessão de hoje já foi concluída', async () => {
      const repo = mockRepo();
      repo.findAssignedWorkout.mockResolvedValue({ id: 'w1', active: true });
      repo.findSessionOfDay.mockResolvedValue({
        id: 'log-1',
        completed: true,
      } as never);
      const useCase = new OpenSessionUseCase(repo, makeCache());

      await expect(useCase.execute('aluna-1', 'w1')).rejects.toThrow(ConflictException);
    });

    it('invalida o cache de progresso (aluno e all) ao abrir uma nova sessão', async () => {
      const repo = mockRepo();
      const cache = makeCache();
      const created = { id: 'log-1', completed: false, exerciseLogs: [] } as never;
      repo.findAssignedWorkout.mockResolvedValue({ id: 'w1', active: true });
      repo.findSessionOfDay.mockResolvedValue(null);
      repo.open.mockResolvedValue(created);
      const useCase = new OpenSessionUseCase(repo, cache);

      await expect(useCase.execute('aluna-1', 'w1')).resolves.toBe(created);
      expect(cache.invalidarUsuario).toHaveBeenCalledWith('aluna-1');
      expect(cache.invalidarUsuario).toHaveBeenCalledWith('all');
    });

    it('recupera corrida concorrente P2002 devolvendo a sessão já criada', async () => {
      const repo = mockRepo();
      const created = { id: 'log-1', completed: false, exerciseLogs: [] } as never;
      repo.findAssignedWorkout.mockResolvedValue({ id: 'w1', active: true });
      repo.findSessionOfDay.mockResolvedValueOnce(null).mockResolvedValueOnce(created);
      repo.open.mockRejectedValue({ code: 'P2002' });
      const useCase = new OpenSessionUseCase(repo, makeCache());

      await expect(useCase.execute('aluna-1', 'w1')).resolves.toBe(created);
    });
  });

  describe('PatchExerciseLogUseCase', () => {
    const cache = { invalidarUsuario: jest.fn() } as unknown as CacheService;

    it('rejeita (403) sessão de outro usuário', async () => {
      const repo = mockRepo();
      repo.findById.mockResolvedValue({ id: 'log-1', userId: 'outra', workoutId: 'w1' } as never);
      const useCase = new PatchExerciseLogUseCase(repo, cache);

      await expect(
        useCase.execute('aluna-1', 'log-1', 'we-1', { status: ExerciseStatus.DONE }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejeita (404) exercício que não pertence ao treino da sessão', async () => {
      const repo = mockRepo();
      repo.findById.mockResolvedValue({ id: 'log-1', userId: 'aluna-1', workoutId: 'w1' } as never);
      repo.workoutExerciseBelongsToWorkout.mockResolvedValue(false);
      const useCase = new PatchExerciseLogUseCase(repo, cache);

      await expect(
        useCase.execute('aluna-1', 'log-1', 'we-de-outro-treino', { status: ExerciseStatus.DONE }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.upsertExerciseLog).not.toHaveBeenCalled();
    });

    it('rejeita (400) actualExerciseId inexistente quando status = REPLACED', async () => {
      const repo = mockRepo();
      repo.findById.mockResolvedValue({ id: 'log-1', userId: 'aluna-1', workoutId: 'w1' } as never);
      repo.workoutExerciseBelongsToWorkout.mockResolvedValue(true);
      repo.exerciseExists.mockResolvedValue(false);
      const useCase = new PatchExerciseLogUseCase(repo, cache);

      await expect(
        useCase.execute('aluna-1', 'log-1', 'we-1', {
          status: ExerciseStatus.REPLACED,
          actualExerciseId: 'ex-inexistente',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.upsertExerciseLog).not.toHaveBeenCalled();
    });

    it('salva normalmente quando sessão, exercício e substituto são válidos', async () => {
      const repo = mockRepo();
      repo.findById.mockResolvedValue({ id: 'log-1', userId: 'aluna-1', workoutId: 'w1' } as never);
      repo.workoutExerciseBelongsToWorkout.mockResolvedValue(true);
      repo.exerciseExists.mockResolvedValue(true);
      const useCase = new PatchExerciseLogUseCase(repo, cache);

      const res = await useCase.execute('aluna-1', 'log-1', 'we-1', {
        status: ExerciseStatus.REPLACED,
        actualExerciseId: 'ex-alt',
      });
      expect(res).toEqual({ ok: true });
      expect(repo.upsertExerciseLog).toHaveBeenCalledTimes(1);
    });
  });

  describe('GetLastPerformanceUseCase & LastPerformanceQueryDto', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    it('rejeita (400) quando workoutId é omitido ou vazio na query', async () => {
      await expect(
        pipe.transform({}, { type: 'query', metatype: LastPerformanceQueryDto }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform({ workoutId: '' }, { type: 'query', metatype: LastPerformanceQueryDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita (404) quando o treino não está direcionado ao usuário', async () => {
      const repo = mockRepo();
      repo.findAssignedWorkout.mockResolvedValue(null);
      const useCase = new GetLastPerformanceUseCase(repo);

      await expect(useCase.execute('aluna-1', 'treino-alheio')).rejects.toThrow(NotFoundException);
      expect(repo.listPrescribedExercises).not.toHaveBeenCalled();
    });

    it('retorna a última performance quando o treino está direcionado ao usuário', async () => {
      const repo = mockRepo();
      repo.findAssignedWorkout.mockResolvedValue({ id: 'w1', active: true });
      repo.listPrescribedExercises.mockResolvedValue([
        { workoutExerciseId: 'we-1', exerciseId: 'ex-1', mode: ExerciseMode.REPS, reps: '10' },
      ]);
      repo.findLastPerformances.mockResolvedValue([
        {
          exerciseId: 'ex-1',
          performedAt: new Date('2026-11-20T12:00:00Z'),
          loadUsed: 40,
          totalSeconds: null,
          sets: [{ setNumber: 1, weight: 40, reps: 10, durationSeconds: null }],
        },
      ]);
      const useCase = new GetLastPerformanceUseCase(repo);

      const res = await useCase.execute('aluna-1', 'w1');
      expect(res['we-1']).toMatchObject({ loadUsed: 40 });
    });
  });
});
