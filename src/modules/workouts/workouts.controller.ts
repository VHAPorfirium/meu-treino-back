import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../shared/auth/roles.decorator';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { CreateWorkoutDto } from './application/dto/create-workout.dto';
import { AddExerciseDto } from './application/dto/add-exercise.dto';
import { CreateWorkoutUseCase } from './application/use-cases/create-workout.use-case';
import { AddExerciseUseCase } from './application/use-cases/add-exercise.use-case';
import { GetTodayWorkoutUseCase } from './application/use-cases/get-today-workout.use-case';
import { ListWorkoutsUseCase } from './application/use-cases/list-workouts.use-case';
import { GetWorkoutUseCase } from './application/use-cases/get-workout.use-case';

@Controller('workouts')
export class WorkoutsController {
  constructor(
    private readonly createWorkout: CreateWorkoutUseCase,
    private readonly addExercise: AddExerciseUseCase,
    private readonly getToday: GetTodayWorkoutUseCase,
    private readonly listWorkouts: ListWorkoutsUseCase,
    private readonly getWorkout: GetWorkoutUseCase,
  ) {}

  // GET /api/workouts/today?dayOfWeek=1  (TRAINEE)
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Get('today')
  today(
    @CurrentUser() user: AuthUser,
    @Query('dayOfWeek') dayOfWeek?: string,
  ) {
    const dow = dayOfWeek !== undefined ? Number(dayOfWeek) : undefined;
    return this.getToday.execute(user.userId, dow);
  }

  // GET /api/workouts  (ADMIN) — lista todos os treinos
  @Roles(Role.ADMIN)
  @Get()
  list() {
    return this.listWorkouts.execute();
  }

  // GET /api/workouts/:id  (ADMIN) — treino com exercícios
  @Roles(Role.ADMIN)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.getWorkout.execute(id);
  }

  // POST /api/workouts  (ADMIN)
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateWorkoutDto) {
    return this.createWorkout.execute(dto);
  }

  // POST /api/workouts/:id/exercises  (ADMIN)
  @Roles(Role.ADMIN)
  @Post(':id/exercises')
  addEx(@Param('id') id: string, @Body() dto: AddExerciseDto) {
    return this.addExercise.execute(id, dto);
  }
}
