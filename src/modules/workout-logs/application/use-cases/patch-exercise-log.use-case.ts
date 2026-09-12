import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExerciseStatus } from '@prisma/client';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';
import { PatchExerciseLogDto } from '../dto/patch-exercise-log.dto';

@Injectable()
export class PatchExerciseLogUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly repo: WorkoutLogRepository,
  ) {}

  async execute(
    userId: string,
    logId: string,
    workoutExerciseId: string,
    dto: PatchExerciseLogDto,
  ) {
    const log = await this.repo.findById(logId);
    if (!log) throw new NotFoundException('Sessão não encontrada');
    if (log.userId !== userId)
      throw new ForbiddenException('Sessão de outro usuário');

    if (dto.status === ExerciseStatus.REPLACED && !dto.actualExerciseId) {
      throw new BadRequestException(
        'actualExerciseId é obrigatório quando status = REPLACED',
      );
    }

    await this.repo.upsertExerciseLog(logId, workoutExerciseId, {
      status: dto.status,
      actualExerciseId:
        dto.status === ExerciseStatus.REPLACED ? dto.actualExerciseId : null,
      loadUsed: dto.loadUsed ?? null,
      setsCompleted: dto.setsCompleted ?? null,
      note: dto.note ?? null,
    });

    return { ok: true };
  }
}
