import { calculateExerciseStats } from './exercise-stats-calculator';

describe('calculateExerciseStats', () => {
  const now = new Date('2026-11-21T12:00:00Z');

  it('calcula melhor carga, vezes feito e evolução de 30 dias', () => {
    const stats = calculateExerciseStats(
      [
        { performedAt: new Date('2026-09-01T12:00:00Z'), heaviestWeight: 30 },
        { performedAt: new Date('2026-11-01T12:00:00Z'), heaviestWeight: 40 },
        { performedAt: new Date('2026-11-20T12:00:00Z'), heaviestWeight: 45 },
      ],
      now,
    );
    expect(stats).toEqual({
      timesPerformed: 3,
      bestWeight: 45,
      evolutionLast30DaysPercentage: 13,
      lastPerformedAt: '2026-11-20T12:00:00.000Z',
    });
  });

  it('sem registros devolve zeros e nulos', () => {
    expect(calculateExerciseStats([], now)).toEqual({
      timesPerformed: 0,
      bestWeight: null,
      evolutionLast30DaysPercentage: null,
      lastPerformedAt: null,
    });
  });
});
