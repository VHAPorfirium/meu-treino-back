import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../shared/auth/roles.decorator';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { CreateWorkoutDto } from './application/dto/create-workout.dto';
import { AddExerciseDto } from './application/dto/add-exercise.dto';
import { AddExercisesBatchDto } from './application/dto/add-exercises-batch.dto';
import { UpdateWorkoutDto } from './application/dto/update-workout.dto';
import { UpdateWorkoutExerciseDto } from './application/dto/update-workout-exercise.dto';
import { SetAssigneesDto } from './application/dto/set-assignees.dto';
import { ReorderExercisesDto } from './application/dto/reorder-exercises.dto';
import { DuplicateWorkoutDto } from './application/dto/duplicate-workout.dto';
import { TodayWorkoutQueryDto } from './application/dto/today-workout.query';
import { CreateWorkoutUseCase } from './application/use-cases/create-workout.use-case';
import { AddExerciseUseCase } from './application/use-cases/add-exercise.use-case';
import { AddExercisesBatchUseCase } from './application/use-cases/add-exercises-batch.use-case';
import { GetTodayWorkoutUseCase } from './application/use-cases/get-today-workout.use-case';
import { ListWorkoutsUseCase } from './application/use-cases/list-workouts.use-case';
import { GetWorkoutUseCase } from './application/use-cases/get-workout.use-case';
import { UpdateWorkoutUseCase } from './application/use-cases/update-workout.use-case';
import { DeleteWorkoutUseCase } from './application/use-cases/delete-workout.use-case';
import { UpdateWorkoutExerciseUseCase } from './application/use-cases/update-workout-exercise.use-case';
import { RemoveWorkoutExerciseUseCase } from './application/use-cases/remove-workout-exercise.use-case';
import { SetAssigneesUseCase } from './application/use-cases/set-assignees.use-case';
import { ReorderExercisesUseCase } from './application/use-cases/reorder-exercises.use-case';
import { DuplicateWorkoutUseCase } from './application/use-cases/duplicate-workout.use-case';
import { ListMyWorkoutsUseCase } from './application/use-cases/list-my-workouts.use-case';
import { GetWorkoutSessionUseCase } from './application/use-cases/get-workout-session.use-case';

@Controller('workouts')
export class WorkoutsController {
  constructor(
    private readonly createWorkout: CreateWorkoutUseCase,
    private readonly addExercise: AddExerciseUseCase,
    private readonly addExercisesBatch: AddExercisesBatchUseCase,
    private readonly getToday: GetTodayWorkoutUseCase,
    private readonly listWorkouts: ListWorkoutsUseCase,
    private readonly getWorkout: GetWorkoutUseCase,
    private readonly updateWorkout: UpdateWorkoutUseCase,
    private readonly deleteWorkout: DeleteWorkoutUseCase,
    private readonly updateExercise: UpdateWorkoutExerciseUseCase,
    private readonly removeExercise: RemoveWorkoutExerciseUseCase,
    private readonly setAssignees: SetAssigneesUseCase,
    private readonly reorderExercises: ReorderExercisesUseCase,
    private readonly duplicateWorkout: DuplicateWorkoutUseCase,
    private readonly listMine: ListMyWorkoutsUseCase,
    private readonly getWorkoutSession: GetWorkoutSessionUseCase,
  ) {}

  // ── leitura do aluno ───────────────────────────────────────────────────────

  // GET /api/workouts/today?dayOfWeek=1  — treino direcionado ao usuário (com isFallback)
  @Roles(Role.TRAINEE)
  @Get('today')
  today(
    @CurrentUser() user: AuthUser,
    @Query() query: TodayWorkoutQueryDto,
  ) {
    return this.getToday.execute(user.userId, query.dayOfWeek);
  }

  // GET /api/workouts/mine — treinos direcionados ao usuário logado
  @Roles(Role.TRAINEE)
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.listMine.execute(user.userId);
  }

  // GET /api/workouts/:id/session — treino escolhido pelo aluno + sessão do dia
  @Roles(Role.TRAINEE)
  @Get(':id/session')
  session(@CurrentUser() user: AuthUser, @Param('id') workoutId: string) {
    return this.getWorkoutSession.execute(user.userId, workoutId);
  }

  // ── gestão (personal) ──────────────────────────────────────────────────────

  // GET /api/workouts — lista apenas os treinos do personal autenticado
  @Roles(Role.PERSONAL)
  @Get()
  list(@CurrentUser() trainer: AuthUser) {
    return this.listWorkouts.execute(trainer.userId);
  }

  // GET /api/workouts/:id — treino com exercícios + destinatários (com checagem de ownership)
  @Roles(Role.PERSONAL)
  @Get(':id')
  detail(@CurrentUser() trainer: AuthUser, @Param('id') id: string) {
    return this.getWorkout.execute(id, trainer.userId);
  }

  // POST /api/workouts
  @Roles(Role.PERSONAL)
  @Post()
  create(@CurrentUser() trainer: AuthUser, @Body() dto: CreateWorkoutDto) {
    return this.createWorkout.execute(dto, trainer.userId);
  }

  // PATCH /api/workouts/:id — nome / dayOfWeek / active (E1)
  @Roles(Role.PERSONAL)
  @Patch(':id')
  update(
    @CurrentUser() trainer: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkoutDto,
  ) {
    return this.updateWorkout.execute(id, dto, trainer.userId);
  }

  // DELETE /api/workouts/:id — 409 se houver histórico (E1)
  @Roles(Role.PERSONAL)
  @Delete(':id')
  remove(@CurrentUser() trainer: AuthUser, @Param('id') id: string) {
    return this.deleteWorkout.execute(id, trainer.userId);
  }

  // PUT /api/workouts/:id/assignees { userIds } — pra quem é o treino (E1.1)
  @Roles(Role.PERSONAL)
  @Put(':id/assignees')
  assignees(
    @CurrentUser() trainer: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetAssigneesDto,
  ) {
    return this.setAssignees.execute(id, dto, trainer.userId);
  }

  // POST /api/workouts/:id/duplicate (E2)
  @Roles(Role.PERSONAL)
  @Post(':id/duplicate')
  @HttpCode(201)
  duplicate(
    @CurrentUser() trainer: AuthUser,
    @Param('id') id: string,
    @Body() dto: DuplicateWorkoutDto,
  ) {
    return this.duplicateWorkout.execute(id, dto, trainer.userId);
  }

  // POST /api/workouts/:id/exercises/batch { items[] }
  @Roles(Role.PERSONAL)
  @Post(':id/exercises/batch')
  @HttpCode(201)
  addExBatch(
    @CurrentUser() trainer: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddExercisesBatchDto,
  ) {
    return this.addExercisesBatch.execute(id, dto, trainer.userId);
  }

  // POST /api/workouts/:id/exercises
  @Roles(Role.PERSONAL)
  @Post(':id/exercises')
  addEx(
    @CurrentUser() trainer: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddExerciseDto,
  ) {
    return this.addExercise.execute(id, dto, trainer.userId);
  }

  // PATCH /api/workouts/:id/exercises/reorder { items } (E2)
  @Roles(Role.PERSONAL)
  @Patch(':id/exercises/reorder')
  reorder(
    @CurrentUser() trainer: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReorderExercisesDto,
  ) {
    return this.reorderExercises.execute(id, dto, trainer.userId);
  }

  // PATCH /api/workouts/:id/exercises/:weId — sets/reps/rest/notes (E1)
  @Roles(Role.PERSONAL)
  @Patch(':id/exercises/:weId')
  updateEx(
    @CurrentUser() trainer: AuthUser,
    @Param('id') id: string,
    @Param('weId') weId: string,
    @Body() dto: UpdateWorkoutExerciseDto,
  ) {
    return this.updateExercise.execute(id, weId, dto, trainer.userId);
  }

  // DELETE /api/workouts/:id/exercises/:weId — 409 se já executado (E1)
  @Roles(Role.PERSONAL)
  @Delete(':id/exercises/:weId')
  removeEx(
    @CurrentUser() trainer: AuthUser,
    @Param('id') id: string,
    @Param('weId') weId: string,
  ) {
    return this.removeExercise.execute(id, weId, trainer.userId);
  }
}
