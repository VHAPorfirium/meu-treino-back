import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../shared/auth/roles.decorator';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { OpenSessionDto } from './application/dto/open-session.dto';
import { PatchExerciseLogDto } from './application/dto/patch-exercise-log.dto';
import { OpenSessionUseCase } from './application/use-cases/open-session.use-case';
import { PatchExerciseLogUseCase } from './application/use-cases/patch-exercise-log.use-case';
import { CompleteSessionUseCase } from './application/use-cases/complete-session.use-case';
import { HistoryUseCase } from './application/use-cases/history.use-case';
import { MyHistoryUseCase } from './application/use-cases/my-history.use-case';
import { ProgressSummaryUseCase } from './application/use-cases/progress-summary.use-case';

@Controller('workout-logs')
export class WorkoutLogsController {
  constructor(
    private readonly openSession: OpenSessionUseCase,
    private readonly patchExercise: PatchExerciseLogUseCase,
    private readonly completeSession: CompleteSessionUseCase,
    private readonly history: HistoryUseCase,
    private readonly myHistory: MyHistoryUseCase,
    private readonly progress: ProgressSummaryUseCase,
  ) {}

  // POST /api/workout-logs  { workoutId }  (TRAINEE) — abre/retoma sessão do dia
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Post()
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenSessionDto) {
    return this.openSession.execute(user.userId, dto.workoutId);
  }

  // PATCH /api/workout-logs/:id/exercises/:weId  (TRAINEE)
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Patch(':id/exercises/:weId')
  patch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('weId') weId: string,
    @Body() dto: PatchExerciseLogDto,
  ) {
    return this.patchExercise.execute(user.userId, id, weId, dto);
  }

  // PATCH /api/workout-logs/:id/complete  (TRAINEE)
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Patch(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.completeSession.execute(user.userId, id);
  }

  // GET /api/workout-logs/history  (ADMIN)
  @Roles(Role.ADMIN)
  @Get('history')
  getHistory() {
    return this.history.execute();
  }

  // GET /api/workout-logs/my-history  (TRAINEE) — histórico da própria aluna
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Get('my-history')
  getMyHistory(@CurrentUser() user: AuthUser) {
    return this.myHistory.execute(user.userId);
  }

  // GET /api/workout-logs/progress-summary  (ADMIN)
  @Roles(Role.ADMIN)
  @Get('progress-summary')
  getProgress() {
    return this.progress.execute();
  }
}
