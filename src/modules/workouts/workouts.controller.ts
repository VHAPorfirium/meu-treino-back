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
  ) {}

  // ── leitura da aluna ───────────────────────────────────────────────────────

  // GET /api/workouts/today?dayOfWeek=1  — treino direcionado ao usuário (com isFallback)
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Get('today')
  today(
    @CurrentUser() user: AuthUser,
    @Query('dayOfWeek') dayOfWeek?: string,
  ) {
    const dow = dayOfWeek !== undefined ? Number(dayOfWeek) : undefined;
    return this.getToday.execute(user.userId, dow);
  }

  // GET /api/workouts/mine — treinos direcionados ao usuário logado
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.listMine.execute(user.userId);
  }

  // ── gestão (admin) ─────────────────────────────────────────────────────────

  // GET /api/workouts — lista todos os treinos (com destinatários)
  @Roles(Role.ADMIN)
  @Get()
  list() {
    return this.listWorkouts.execute();
  }

  // GET /api/workouts/:id — treino com exercícios + destinatários
  @Roles(Role.ADMIN)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.getWorkout.execute(id);
  }

  // POST /api/workouts
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateWorkoutDto) {
    return this.createWorkout.execute(dto);
  }

  // PATCH /api/workouts/:id — nome / dayOfWeek / active (E1)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkoutDto) {
    return this.updateWorkout.execute(id, dto);
  }

  // DELETE /api/workouts/:id — 409 se houver histórico (E1)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.deleteWorkout.execute(id);
  }

  // PUT /api/workouts/:id/assignees { userIds } — pra quem é o treino (E1.1)
  @Roles(Role.ADMIN)
  @Put(':id/assignees')
  assignees(@Param('id') id: string, @Body() dto: SetAssigneesDto) {
    return this.setAssignees.execute(id, dto);
  }

  // POST /api/workouts/:id/duplicate (E2)
  @Roles(Role.ADMIN)
  @Post(':id/duplicate')
  @HttpCode(201)
  duplicate(@Param('id') id: string, @Body() dto: DuplicateWorkoutDto) {
    return this.duplicateWorkout.execute(id, dto);
  }

  // POST /api/workouts/:id/exercises/batch { items[] } — N exercícios numa
  // transação, `order` definido pelo servidor (E7). Antes de :id/exercises.
  @Roles(Role.ADMIN)
  @Post(':id/exercises/batch')
  @HttpCode(201)
  addExBatch(@Param('id') id: string, @Body() dto: AddExercisesBatchDto) {
    return this.addExercisesBatch.execute(id, dto);
  }

  // POST /api/workouts/:id/exercises
  @Roles(Role.ADMIN)
  @Post(':id/exercises')
  addEx(@Param('id') id: string, @Body() dto: AddExerciseDto) {
    return this.addExercise.execute(id, dto);
  }

  // PATCH /api/workouts/:id/exercises/reorder { items } (E2) — antes do :weId pra não colidir
  @Roles(Role.ADMIN)
  @Patch(':id/exercises/reorder')
  reorder(@Param('id') id: string, @Body() dto: ReorderExercisesDto) {
    return this.reorderExercises.execute(id, dto);
  }

  // PATCH /api/workouts/:id/exercises/:weId — sets/reps/rest/notes (E1)
  @Roles(Role.ADMIN)
  @Patch(':id/exercises/:weId')
  updateEx(
    @Param('id') id: string,
    @Param('weId') weId: string,
    @Body() dto: UpdateWorkoutExerciseDto,
  ) {
    return this.updateExercise.execute(id, weId, dto);
  }

  // DELETE /api/workouts/:id/exercises/:weId — 409 se já executado (E1)
  @Roles(Role.ADMIN)
  @Delete(':id/exercises/:weId')
  removeEx(@Param('id') id: string, @Param('weId') weId: string) {
    return this.removeExercise.execute(id, weId);
  }
}
