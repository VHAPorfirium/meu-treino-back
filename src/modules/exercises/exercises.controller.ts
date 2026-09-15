import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListExercisesQuery } from './application/dto/list-exercises.query';
import {
  ListEquipmentUseCase,
  ListExercisesUseCase,
} from './application/use-cases/list-exercises.use-case';
import { GetAlternativesUseCase } from './application/use-cases/get-alternatives.use-case';
import { GetExerciseUseCase } from './application/use-cases/get-exercise.use-case';

@Controller('exercises')
export class ExercisesController {
  constructor(
    private readonly listExercises: ListExercisesUseCase,
    private readonly listEquipment: ListEquipmentUseCase,
    private readonly getAlternatives: GetAlternativesUseCase,
    private readonly getExercise: GetExerciseUseCase,
  ) {}

  // GET /api/exercises?muscleGroup=&equipment=&search=&page=&pageSize=
  // Resposta: { items, total, page, pageSize, totalPages, hasPrev, hasNext }
  @Get()
  list(@Query() query: ListExercisesQuery) {
    return this.listExercises.execute(query);
  }

  // GET /api/exercises/equipment — precisa vir ANTES de /:id, senão "equipment" cai como id
  @Get('equipment')
  equipment() {
    return this.listEquipment.execute();
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
