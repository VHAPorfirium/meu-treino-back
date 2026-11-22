export interface TraineeActivity {
  userId: string;
  userName: string;
  lastCompletedWorkoutAt: Date | null;
  /** Exercício mais pulado nos últimos 30 dias e quantas vezes. */
  mostSkippedExercise: { exerciseName: string; skippedCount: number } | null;
}

export interface AttentionItem {
  userId: string;
  userName: string;
  kind: 'inactive' | 'skipping';
  /** Texto pronto para a tela: "Sem treinar há 5 dias". */
  description: string;
  daysWithoutTraining: number | null;
}

export const INACTIVE_AFTER_DAYS = 4;
export const SKIPPING_AFTER_COUNT = 3;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Quem precisa de atenção do personal: parou de treinar ou vive pulando o mesmo exercício. */
export function findTraineesNeedingAttention(
  traineeActivities: TraineeActivity[],
  now: Date = new Date(),
): AttentionItem[] {
  const attentionItems: AttentionItem[] = [];

  for (const activity of traineeActivities) {
    const daysWithoutTraining = activity.lastCompletedWorkoutAt
      ? Math.floor((now.getTime() - activity.lastCompletedWorkoutAt.getTime()) / MILLISECONDS_PER_DAY)
      : null;

    if (daysWithoutTraining === null) {
      attentionItems.push({
        userId: activity.userId,
        userName: activity.userName,
        kind: 'inactive',
        description: 'Ainda não concluiu nenhum treino',
        daysWithoutTraining: null,
      });
    } else if (daysWithoutTraining >= INACTIVE_AFTER_DAYS) {
      attentionItems.push({
        userId: activity.userId,
        userName: activity.userName,
        kind: 'inactive',
        description: `Sem treinar há ${daysWithoutTraining} dias`,
        daysWithoutTraining,
      });
    }

    if (activity.mostSkippedExercise && activity.mostSkippedExercise.skippedCount >= SKIPPING_AFTER_COUNT) {
      attentionItems.push({
        userId: activity.userId,
        userName: activity.userName,
        kind: 'skipping',
        description: `Pulou ${activity.mostSkippedExercise.exerciseName} ${activity.mostSkippedExercise.skippedCount}×`,
        daysWithoutTraining,
      });
    }
  }

  // quem está há mais tempo parado aparece primeiro
  return attentionItems.sort((first, second) => (second.daysWithoutTraining ?? 999) - (first.daysWithoutTraining ?? 999));
}
