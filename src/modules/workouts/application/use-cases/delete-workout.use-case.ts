import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  TrainerAccessService,
  ensureTrainerAccess,
} from '../../../links/application/trainer-access.service';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import { assertWorkoutOwnership } from '../workout-ownership';

@Injectable()
export class DeleteWorkoutUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
    @Optional() private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(id: string, trainerId?: string) {
    const workout = await this.repo.findById(id);
    if (!workout) throw new NotFoundException('Treino não encontrado');
    assertWorkoutOwnership(workout, trainerId);

    // Treino com sessões registradas faz parte do histórico/dashboard → não apaga.
    // (WorkoutLog.workoutId não tem cascade de propósito.)
    const logs = await this.repo.countLogs(id);
    if (logs > 0) {
      throw new ConflictException(
        `Este treino tem ${logs} sessão(ões) registrada(s). Desative-o em vez de excluir.`,
      );
    }

    // Se o treino ainda está com algum ex-aluno (vínculo ENDED), só sai da carteira
    // do personal — não some debaixo do aluno que já foi desvinculado.
    if (trainerId && ensureTrainerAccess(this.trainerAccess)) {
      const assigneeIds = await this.repo.listAssigneeIds(id);
      if (assigneeIds.length > 0) {
        const activeSet = new Set(await this.trainerAccess.getActiveTraineeIds(trainerId));
        if (assigneeIds.some((uid) => !activeSet.has(uid))) {
          await this.repo.detachOwner(id);
          return { ok: true, detached: true };
        }
      }
    }

    try {
      await this.repo.delete(id);
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code;
      if (code === 'P2003') {
        throw new ConflictException(
          'Este treino tem sessões registradas. Desative-o em vez de excluir.',
        );
      }
      if (code === 'P2025') {
        throw new NotFoundException('Treino não encontrado');
      }
      throw err;
    }
    return { ok: true };
  }
}
