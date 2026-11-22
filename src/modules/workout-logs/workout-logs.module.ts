import { Module } from '@nestjs/common';
import { ProgramsModule } from '../programs/programs.module';
import { WorkoutLogsController } from './workout-logs.controller';
import { WORKOUT_LOG_REPOSITORY } from './domain/workout-log.repository';
import { PrismaWorkoutLogRepository } from './infrastructure/prisma-workout-log.repository';
import { OpenSessionUseCase } from './application/use-cases/open-session.use-case';
import { PatchExerciseLogUseCase } from './application/use-cases/patch-exercise-log.use-case';
import { CompleteSessionUseCase } from './application/use-cases/complete-session.use-case';
import { HistoryUseCase } from './application/use-cases/history.use-case';
import { MyHistoryUseCase } from './application/use-cases/my-history.use-case';
import { ProgressSummaryUseCase } from './application/use-cases/progress-summary.use-case';
import { GetLastPerformanceUseCase } from './application/use-cases/get-last-performance.use-case';
import { GetExerciseStatsUseCase } from './application/use-cases/get-exercise-stats.use-case';
import { ListAttentionItemsUseCase } from './application/use-cases/list-attention-items.use-case';

@Module({
  imports: [ProgramsModule],
  controllers: [WorkoutLogsController],
  providers: [
    { provide: WORKOUT_LOG_REPOSITORY, useClass: PrismaWorkoutLogRepository },
    OpenSessionUseCase,
    PatchExerciseLogUseCase,
    CompleteSessionUseCase,
    HistoryUseCase,
    MyHistoryUseCase,
    ProgressSummaryUseCase,
    GetLastPerformanceUseCase,
    GetExerciseStatsUseCase,
    ListAttentionItemsUseCase,
  ],
})
export class WorkoutLogsModule {}
