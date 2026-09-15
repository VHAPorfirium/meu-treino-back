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
    // Sessão finalizada continua aceitando PATCH: o replay da fila offline (E5)
    // pode chegar depois do `complete` e precisa ser inofensivo (idempotente).

    if (dto.status === ExerciseStatus.REPLACED && !dto.actualExerciseId) {
      throw new BadRequestException(
        'actualExerciseId é obrigatório quando status = REPLACED',
      );
    }

    // E4: se vieram séries, os agregados (compat c/ dashboard) são DERIVADOS delas.
    let loadUsed = dto.loadUsed ?? null;
    let setsCompleted = dto.setsCompleted ?? null;
    let totalSeconds = dto.totalSeconds ?? null;
    if (dto.sets) {
      const numbers = dto.sets.map((s) => s.setNumber);
      if (new Set(numbers).size !== numbers.length) {
        throw new BadRequestException('setNumber repetido em `sets`');
      }
      const weights = dto.sets
        .map((s) => s.weight)
        .filter((w): w is number => typeof w === 'number');
      loadUsed = weights.length ? Math.max(...weights) : null;
      setsCompleted = dto.sets.length;

      // E10 — tempo total é a SOMA das durações (diferente da carga, que é o máximo:
      // 3 blocos de 10 min são 30 min de cardio, mas 3 séries de 20 kg são 20 kg).
      const duracoes = dto.sets
        .map((s) => s.durationSeconds)
        .filter((d): d is number => typeof d === 'number');
      totalSeconds = duracoes.length
        ? duracoes.reduce((a, b) => a + b, 0)
        : null;
    }

    await this.repo.upsertExerciseLog(logId, workoutExerciseId, {
      status: dto.status,
      actualExerciseId:
        dto.status === ExerciseStatus.REPLACED ? dto.actualExerciseId : null,
      loadUsed,
      setsCompleted,
      totalSeconds,
      note: dto.note ?? null,
      sets: dto.sets?.map((s) => ({
        setNumber: s.setNumber,
        weight: s.weight ?? null,
        reps: s.reps ?? null,
        durationSeconds: s.durationSeconds ?? null,
      })),
    });

    return { ok: true };
  }
}
