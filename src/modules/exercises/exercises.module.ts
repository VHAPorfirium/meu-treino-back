import { Module } from '@nestjs/common';
import { ExercisesController } from './exercises.controller';
import { EXERCISE_REPOSITORY } from './domain/exercise.repository';
import { PrismaExerciseRepository } from './infrastructure/prisma-exercise.repository';
import {
  ListEquipmentUseCase,
  ListExercisesUseCase,
} from './application/use-cases/list-exercises.use-case';
import { GetAlternativesUseCase } from './application/use-cases/get-alternatives.use-case';
import { GetExerciseUseCase } from './application/use-cases/get-exercise.use-case';

@Module({
  controllers: [ExercisesController],
  providers: [
    { provide: EXERCISE_REPOSITORY, useClass: PrismaExerciseRepository },
    ListExercisesUseCase,
    ListEquipmentUseCase,
    GetAlternativesUseCase,
    GetExerciseUseCase,
  ],
  exports: [EXERCISE_REPOSITORY],
})
export class ExercisesModule {}
