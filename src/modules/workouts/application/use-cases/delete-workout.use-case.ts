import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';

@Injectable()
export class DeleteWorkoutUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
  ) {}

  async execute(id: string) {
    const workout = await this.repo.findById(id);
    if (!workout) throw new NotFoundException('Treino não encontrado');

    // Treino com sessões registradas faz parte do histórico/dashboard → não apaga.
    // (WorkoutLog.workoutId não tem cascade de propósito.)
    const logs = await this.repo.countLogs(id);
    if (logs > 0) {
      throw new ConflictException(
        `Este treino tem ${logs} sessão(ões) registrada(s). Desative-o em vez de excluir.`,
      );
    }

    await this.repo.delete(id);
    return { ok: true };
  }
}
