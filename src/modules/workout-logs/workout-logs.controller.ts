import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../../shared/auth/roles.decorator';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { OpenSessionDto } from './application/dto/open-session.dto';
import { PatchExerciseLogDto } from './application/dto/patch-exercise-log.dto';
import { LastPerformanceQueryDto } from './application/dto/last-performance.query';
import { HistoryQueryDto } from './application/dto/history.query';
import { OpenSessionUseCase } from './application/use-cases/open-session.use-case';
import { PatchExerciseLogUseCase } from './application/use-cases/patch-exercise-log.use-case';
import { CompleteSessionUseCase } from './application/use-cases/complete-session.use-case';
import { HistoryUseCase } from './application/use-cases/history.use-case';
import { MyHistoryUseCase } from './application/use-cases/my-history.use-case';
import { ProgressSummaryUseCase } from './application/use-cases/progress-summary.use-case';
import { GetLastPerformanceUseCase } from './application/use-cases/get-last-performance.use-case';
import { GetExerciseStatsUseCase } from './application/use-cases/get-exercise-stats.use-case';
import { ListAttentionItemsUseCase } from './application/use-cases/list-attention-items.use-case';

@Controller('workout-logs')
export class WorkoutLogsController {
  constructor(
    private readonly openSession: OpenSessionUseCase,
    private readonly patchExercise: PatchExerciseLogUseCase,
    private readonly completeSession: CompleteSessionUseCase,
    private readonly history: HistoryUseCase,
    private readonly myHistory: MyHistoryUseCase,
    private readonly progress: ProgressSummaryUseCase,
    private readonly getLastPerformance: GetLastPerformanceUseCase,
    private readonly getExerciseStats: GetExerciseStatsUseCase,
    private readonly listAttentionItems: ListAttentionItemsUseCase,
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

  // GET /api/workout-logs/last-performance?workoutId=  — "última vez" + sugestão de carga
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Get('last-performance')
  lastPerformance(
    @CurrentUser() user: AuthUser,
    @Query() query: LastPerformanceQueryDto,
  ) {
    return this.getLastPerformance.execute(user.userId, query.workoutId);
  }

  // GET /api/workout-logs/exercise-stats/:exerciseId — números do aluno no exercício
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Get('exercise-stats/:exerciseId')
  exerciseStats(@CurrentUser() user: AuthUser, @Param('exerciseId') exerciseId: string) {
    return this.getExerciseStats.execute(user.userId, exerciseId);
  }

  // GET /api/workout-logs/attention  (ADMIN) — "Precisa de atenção" do dashboard
  @Roles(Role.ADMIN)
  @Get('attention')
  attention() {
    return this.listAttentionItems.execute();
  }

  // GET /api/workout-logs/history?limit=&offset=  (ADMIN) — retorna array + header X-Total-Count
  @Roles(Role.ADMIN)
  @Get('history')
  async getHistory(
    @Query() query: HistoryQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.history.execute(query);
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  // GET /api/workout-logs/my-history?limit=&offset=  (TRAINEE) — histórico da própria aluna + X-Total-Count
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Get('my-history')
  async getMyHistory(
    @CurrentUser() user: AuthUser,
    @Query() query: HistoryQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.myHistory.execute(user.userId, query);
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  // GET /api/workout-logs/progress-summary?userId=  (ADMIN)
  // Sem `userId` = agregado de todos os alunos; com `userId` = só aquele aluno.
  @Roles(Role.ADMIN)
  @Get('progress-summary')
  getProgress(@Query('userId') userId?: string) {
    return this.progress.execute(userId?.trim() || undefined);
  }
}
