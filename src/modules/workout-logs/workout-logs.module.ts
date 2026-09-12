import { Module } from '@nestjs/common';
import { WorkoutLogsController } from './workout-logs.controller';
import { WORKOUT_LOG_REPOSITORY } from './domain/workout-log.repository';
import { PrismaWorkoutLogRepository } from './infrastructure/prisma-workout-log.repository';
import { OpenSessionUseCase } from './application/use-cases/open-session.use-case';
import { PatchExerciseLogUseCase } from './application/use-cases/patch-exercise-log.use-case';
import { CompleteSessionUseCase } from './application/use-cases/complete-session.use-case';
import { HistoryUseCase } from './application/use-cases/history.use-case';
import { MyHistoryUseCase } from './application/use-cases/my-history.use-case';
import { ProgressSummaryUseCase } from './application/use-cases/progress-summary.use-case';

@Module({
  controllers: [WorkoutLogsController],
  providers: [
    { provide: WORKOUT_LOG_REPOSITORY, useClass: PrismaWorkoutLogRepository },
    OpenSessionUseCase,
    PatchExerciseLogUseCase,
    CompleteSessionUseCase,
    HistoryUseCase,
    MyHistoryUseCase,
    ProgressSummaryUseCase,
  ],
})
export class WorkoutLogsModule {}
