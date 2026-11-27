import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';
import { CacheService } from '../../../../shared/cache/cache.service';
import { invalidarProgresso } from './invalida-progresso';
import {
  CompleteProgramIfFinishedUseCase,
  ProgramCompletionResult,
} from '../../../programs/application/use-cases/complete-program-if-finished.use-case';

@Injectable()
export class CompleteSessionUseCase {
  private readonly logger = new Logger(CompleteSessionUseCase.name);

  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly repo: WorkoutLogRepository,
    private readonly cache: CacheService,
    private readonly completeProgramIfFinished: CompleteProgramIfFinishedUseCase,
  ) {}

  async execute(userId: string, logId: string) {
    const log = await this.repo.findById(logId);
    if (!log) throw new NotFoundException('Sessão não encontrada');
    if (log.userId !== userId)
      throw new ForbiddenException('Sessão de outro usuário');
    const feito = await this.repo.complete(logId);
    await invalidarProgresso(this.cache, userId);
    const programCompletion = await this.checkProgramCompletion(
      userId,
      log.workoutId,
      log.programAssignmentId ?? null,
    );
    return { ...feito, programCompletion };
  }

  /**
   * Se este treino fechou o último dia de um desafio/mesociclo, a jornada é
   * encerrada aqui. Nunca derruba a finalização: a sessão já foi gravada.
   */
  private async checkProgramCompletion(
    userId: string,
    workoutId: string,
    programAssignmentId: string | null,
  ): Promise<ProgramCompletionResult | null> {
    try {
      return await this.completeProgramIfFinished.execute(userId, workoutId, programAssignmentId);
    } catch (err) {
      const e = err as { message?: string; stack?: string };
      this.logger.error(
        `Falha ao avaliar conclusão de programa (userId=${userId}, workoutId=${workoutId}): ${e?.message ?? String(err)}`,
        e?.stack,
      );
      return null;
    }
  }
}
