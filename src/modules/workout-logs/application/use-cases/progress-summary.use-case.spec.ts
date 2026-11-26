import { ExerciseStatus } from '@prisma/client';
import { CacheService } from '../../../../shared/cache/cache.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ProgressSummaryUseCase } from './progress-summary.use-case';

describe('ProgressSummaryUseCase — fuso local (dayKey)', () => {
  const originalTz = process.env.APP_TIMEZONE;

  beforeEach(() => {
    process.env.APP_TIMEZONE = 'America/Sao_Paulo';
  });

  afterAll(() => {
    if (originalTz === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = originalTz;
  });

  it('mantém treino das 22h39 BRT no dia local correto em streak, heatmap, semana, carga e notas', async () => {
    // 22h39 BRT de domingo (2026-09-13) e 22h39 BRT de segunda (2026-09-14)
    // Em UTC já seriam 2026-09-14T01:39Z e 2026-09-15T01:39Z!
    const prisma = {
      workoutLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'log-domingo',
            dayKey: '2026-09-13',
            date: new Date('2026-09-14T01:39:00Z'),
            completed: true,
            exerciseLogs: [
              {
                status: ExerciseStatus.DONE,
                loadUsed: 40,
                setsCompleted: 3,
                totalSeconds: null,
                note: 'Pesado',
                actualExercise: null,
                workoutExercise: { exercise: { name: 'Squat' } },
              },
            ],
          },
          {
            id: 'log-segunda',
            dayKey: '2026-09-14',
            date: new Date('2026-09-15T01:39:00Z'),
            completed: true,
            exerciseLogs: [
              {
                status: ExerciseStatus.DONE,
                loadUsed: 45,
                setsCompleted: 3,
                totalSeconds: null,
                note: null,
                actualExercise: null,
                workoutExercise: { exercise: { name: 'Squat' } },
              },
            ],
          },
        ]),
      },
    } as unknown as PrismaService;

    const useCase = new ProgressSummaryUseCase(prisma, {} as CacheService);

    // "Agora": segunda-feira 2026-09-14 às 23h00 BRT (= 2026-09-15T02:00:00Z)
    const now = new Date('2026-09-15T02:00:00Z');
    const summary = await useCase.calcular('aluna-1', now);

    // Streak: domingo + segunda = 2 dias seguidos
    expect(summary.streak).toEqual({ current: 2, best: 2 });

    // Heatmap termina no dia local 2026-09-14 (não em 2026-09-15 UTC)
    expect(summary.heatmap[summary.heatmap.length - 1]).toEqual({
      date: '2026-09-14',
      level: 3,
    });
    expect(summary.heatmap.find((d) => d.date === '2026-09-13')?.level).toBe(3);

    // Domingo pertence à semana iniciada em 2026-09-07; segunda à semana iniciada em 2026-09-14
    expect(summary.frequency.byWeek).toEqual([
      { week: '2026-09-07', count: 1 },
      { week: '2026-09-14', count: 1 },
    ]);

    // Evolução de carga e notas usam o dayKey local
    expect(summary.loadProgression[0].points).toEqual([
      { date: '2026-09-13', loadUsed: 40 },
      { date: '2026-09-14', loadUsed: 45 },
    ]);
    expect(summary.recentNotes[0].date).toBe('2026-09-13');
  });

  it('usa namePt com fallback para name em pulados, trocados, carga, ranking e notas', async () => {
    const prisma = {
      workoutLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'log-1',
            dayKey: '2026-09-14',
            date: new Date('2026-09-14T15:00:00Z'),
            completed: true,
            exerciseLogs: [
              {
                status: ExerciseStatus.SKIPPED,
                loadUsed: null,
                setsCompleted: null,
                totalSeconds: null,
                note: 'Joelho doendo',
                actualExercise: null,
                workoutExercise: {
                  exercise: { id: 'e1', name: 'barbell squat', namePt: 'Agachamento livre' },
                },
              },
              {
                status: ExerciseStatus.REPLACED,
                loadUsed: 60,
                setsCompleted: 4,
                totalSeconds: null,
                note: null,
                actualExercise: { id: 'e2', name: 'leg press', namePt: 'Leg press 45°' },
                workoutExercise: {
                  exercise: { id: 'e1', name: 'barbell squat', namePt: 'Agachamento livre' },
                },
              },
              {
                status: ExerciseStatus.DONE,
                loadUsed: 20,
                setsCompleted: 3,
                totalSeconds: null,
                note: null,
                actualExercise: null,
                workoutExercise: {
                  exercise: { id: 'e3', name: 'plank', namePt: null },
                },
              },
            ],
          },
        ]),
      },
    } as unknown as PrismaService;

    const useCase = new ProgressSummaryUseCase(prisma, {} as CacheService);

    const summary = await useCase.calcular('aluna-1', new Date('2026-09-14T18:00:00Z'));

    expect(summary.mostSkipped).toEqual([{ exercise: 'Agachamento livre', count: 1 }]);
    expect(summary.mostReplaced).toEqual([
      { from: 'Agachamento livre', to: 'Leg press 45°', count: 1 },
    ]);
    expect(summary.loadProgression.map((lp) => lp.exercise)).toEqual(['Leg press 45°', 'plank']);
    expect(summary.recentNotes[0].exercise).toBe('Agachamento livre');
    expect(summary.ranking).toEqual(
      expect.arrayContaining([
        { name: 'Agachamento livre', type: 'skip', count: 1 },
        { name: 'Agachamento livre', type: 'swap', count: 1 },
      ]),
    );
  });
});
