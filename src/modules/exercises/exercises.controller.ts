import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListExercisesQuery } from './application/dto/list-exercises.query';
import { ListExercisesUseCase } from './application/use-cases/list-exercises.use-case';
import { GetAlternativesUseCase } from './application/use-cases/get-alternatives.use-case';
import { GetExerciseUseCase } from './application/use-cases/get-exercise.use-case';

@Controller('exercises')
export class ExercisesController {
  constructor(
    private readonly listExercises: ListExercisesUseCase,
    private readonly getAlternatives: GetAlternativesUseCase,
    private readonly getExercise: GetExerciseUseCase,
  ) {}

  // GET /api/exercises?muscleGroup=&search=&page=&pageSize=
  @Get()
  list(@Query() query: ListExercisesQuery) {
    return this.listExercises.execute(query);
  }

  // GET /api/exercises/:id/alternatives  — coração do produto
  @Get(':id/alternatives')
  alternatives(@Param('id') id: string) {
    return this.getAlternatives.execute(id);
  }

  // GET /api/exercises/:id
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.getExercise.execute(id);
  }
}
