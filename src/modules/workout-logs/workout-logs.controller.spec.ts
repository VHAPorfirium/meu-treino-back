import type { Response } from 'express';
import { Role } from '@prisma/client';
import { WorkoutLogsController } from './workout-logs.controller';
import { HistoryUseCase } from './application/use-cases/history.use-case';
import { MyHistoryUseCase } from './application/use-cases/my-history.use-case';
import { WorkoutLogRepository } from './domain/workout-log.repository';

describe('WorkoutLogsController — X-Total-Count em history e my-history', () => {
  function makeController(repo: Partial<WorkoutLogRepository>) {
    const history = new HistoryUseCase(repo as WorkoutLogRepository);
    const myHistory = new MyHistoryUseCase(repo as WorkoutLogRepository);
    return new WorkoutLogsController(
      {} as never,
      {} as never,
      {} as never,
      history,
      myHistory,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('GET /workout-logs/history retorna o array e define X-Total-Count com o total real', async () => {
    const items = [{ id: 'log-1' }, { id: 'log-2' }];
    const repo = {
      history: jest.fn().mockResolvedValue(items),
      countHistory: jest.fn().mockResolvedValue(147),
    };
    const controller = makeController(repo);
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;

    const result = await controller.getHistory({ limit: 50, offset: 0 }, res);

    expect(result).toBe(items);
    expect(repo.history).toHaveBeenCalledWith({ limit: 50, offset: 0 });
    expect(repo.countHistory).toHaveBeenCalledTimes(1);
    expect(setHeader).toHaveBeenCalledWith('X-Total-Count', '147');
  });

  it('GET /workout-logs/my-history retorna o array da aluna e define X-Total-Count do usuário', async () => {
    const items = [{ id: 'log-a' }];
    const repo = {
      historyByUser: jest.fn().mockResolvedValue(items),
      countHistoryByUser: jest.fn().mockResolvedValue(112),
    };
    const controller = makeController(repo);
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;

    const result = await controller.getMyHistory(
      {
        userId: 'u-aluna',
        role: Role.TRAINEE,
        name: 'Aluna',
        username: 'aluna',
        mustChangePassword: false,
      },
      { limit: 100, offset: 100 },
      res,
    );

    expect(result).toBe(items);
    expect(repo.historyByUser).toHaveBeenCalledWith('u-aluna', { limit: 100, offset: 100 });
    expect(repo.countHistoryByUser).toHaveBeenCalledWith('u-aluna');
    expect(setHeader).toHaveBeenCalledWith('X-Total-Count', '112');
  });
});
