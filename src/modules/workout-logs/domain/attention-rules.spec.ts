import { findTraineesNeedingAttention } from './attention-rules';

describe('findTraineesNeedingAttention', () => {
  const now = new Date('2026-11-21T12:00:00Z');

  it('aponta quem está parado e quem pula o mesmo exercício', () => {
    const attentionItems = findTraineesNeedingAttention(
      [
        { userId: 'ana', userName: 'Ana', lastCompletedWorkoutAt: new Date('2026-11-20T12:00:00Z'), mostSkippedExercise: null },
        { userId: 'bia', userName: 'Bia', lastCompletedWorkoutAt: new Date('2026-11-16T12:00:00Z'), mostSkippedExercise: null },
        {
          userId: 'carlos',
          userName: 'Carlos',
          lastCompletedWorkoutAt: new Date('2026-11-21T08:00:00Z'),
          mostSkippedExercise: { exerciseName: 'Agachamento', skippedCount: 3 },
        },
      ],
      now,
    );
    expect(attentionItems.map((item) => [item.userId, item.kind, item.description])).toEqual([
      ['bia', 'inactive', 'Sem treinar há 5 dias'],
      ['carlos', 'skipping', 'Pulou Agachamento 3×'],
    ]);
  });
});
