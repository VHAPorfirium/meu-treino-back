import { Module } from '@nestjs/common';
import { WorkoutsController } from './workouts.controller';
import { WORKOUT_REPOSITORY } from './domain/workout.repository';
import { PrismaWorkoutRepository } from './infrastructure/prisma-workout.repository';
import { CreateWorkoutUseCase } from './application/use-cases/create-workout.use-case';
import { AddExerciseUseCase } from './application/use-cases/add-exercise.use-case';
import { GetTodayWorkoutUseCase } from './application/use-cases/get-today-workout.use-case';
import { ListWorkoutsUseCase } from './application/use-cases/list-workouts.use-case';
import { GetWorkoutUseCase } from './application/use-cases/get-workout.use-case';

@Module({
  controllers: [WorkoutsController],
  providers: [
    { provide: WORKOUT_REPOSITORY, useClass: PrismaWorkoutRepository },
    CreateWorkoutUseCase,
    AddExerciseUseCase,
    GetTodayWorkoutUseCase,
    ListWorkoutsUseCase,
    GetWorkoutUseCase,
  ],
  exports: [WORKOUT_REPOSITORY],
})
export class WorkoutsModule {}
