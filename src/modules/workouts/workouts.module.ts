import { Module } from '@nestjs/common';
import { WorkoutsController } from './workouts.controller';
import { WORKOUT_REPOSITORY } from './domain/workout.repository';
import { PrismaWorkoutRepository } from './infrastructure/prisma-workout.repository';
import { UsersModule } from '../users/users.module';
import { PushModule } from '../push/push.module';
import { CreateWorkoutUseCase } from './application/use-cases/create-workout.use-case';
import { AddExerciseUseCase } from './application/use-cases/add-exercise.use-case';
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

@Module({
  imports: [UsersModule, PushModule],
  controllers: [WorkoutsController],
  providers: [
    { provide: WORKOUT_REPOSITORY, useClass: PrismaWorkoutRepository },
    CreateWorkoutUseCase,
    AddExerciseUseCase,
    GetTodayWorkoutUseCase,
    ListWorkoutsUseCase,
    GetWorkoutUseCase,
    UpdateWorkoutUseCase,
    DeleteWorkoutUseCase,
    UpdateWorkoutExerciseUseCase,
    RemoveWorkoutExerciseUseCase,
    SetAssigneesUseCase,
    ReorderExercisesUseCase,
    DuplicateWorkoutUseCase,
    ListMyWorkoutsUseCase,
  ],
  exports: [WORKOUT_REPOSITORY],
})
export class WorkoutsModule {}
