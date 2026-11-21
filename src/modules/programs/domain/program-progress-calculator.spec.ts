import { calculateProgramProgress, countDaysBetween } from './program-progress-calculator';

describe('countDaysBetween', () => {
  it('conta dias atravessando o fim do mês', () => {
    expect(countDaysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(countDaysBetween('2026-11-21', '2026-11-21')).toBe(0);
  });
});

describe('calculateProgramProgress', () => {
  it('o dia do início é o Dia 1', () => {
    const progress = calculateProgramProgress({
      startDayKey: '2026-11-01',
      todayDayKey: '2026-11-01',
      totalDays: 30,
      completedSessions: [],
    });
    expect(progress.currentDayNumber).toBe(1);
    expect(progress.isLastDayReached).toBe(false);
  });

  it('mostra o Dia 19 de 30 e conta dias treinados sem repetir', () => {
    const progress = calculateProgramProgress({
      startDayKey: '2026-11-01',
      todayDayKey: '2026-11-19',
      totalDays: 30,
      completedSessions: [{ dayKey: '2026-11-01' }, { dayKey: '2026-11-01' }, { dayKey: '2026-11-03' }],
    });
    expect(progress.currentDayNumber).toBe(19);
    expect(progress.completedWorkoutsCount).toBe(3);
    expect(progress.trainedDaysCount).toBe(2);
    expect(progress.progressPercentage).toBe(63);
  });

  it('nunca passa do total e marca o último dia como alcançado', () => {
    const progress = calculateProgramProgress({
      startDayKey: '2026-11-01',
      todayDayKey: '2026-12-15',
      totalDays: 30,
      completedSessions: [],
    });
    expect(progress.currentDayNumber).toBe(30);
    expect(progress.progressPercentage).toBe(100);
    expect(progress.isLastDayReached).toBe(true);
  });
});
