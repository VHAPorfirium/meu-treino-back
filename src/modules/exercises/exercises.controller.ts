import { Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { ListExercisesQuery } from './application/dto/list-exercises.query';
import {
  ListEquipmentUseCase,
  ListExercisesUseCase,
} from './application/use-cases/list-exercises.use-case';
import { GetAlternativesUseCase } from './application/use-cases/get-alternatives.use-case';
import { GetExerciseUseCase } from './application/use-cases/get-exercise.use-case';
import {
  AddFavoriteExerciseUseCase,
  ListFavoriteExercisesUseCase,
  RemoveFavoriteExerciseUseCase,
} from './application/use-cases/favorite-exercises.use-cases';

@Controller('exercises')
export class ExercisesController {
  constructor(
    private readonly listExercises: ListExercisesUseCase,
    private readonly listEquipment: ListEquipmentUseCase,
    private readonly getAlternatives: GetAlternativesUseCase,
    private readonly getExercise: GetExerciseUseCase,
    private readonly listFavoriteExercises: ListFavoriteExercisesUseCase,
    private readonly addFavoriteExercise: AddFavoriteExerciseUseCase,
    private readonly removeFavoriteExercise: RemoveFavoriteExerciseUseCase,
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

  // GET /api/exercises/favorites — favoritos do usuário logado (antes de /:id)
  @Get('favorites')
  favorites(@CurrentUser() user: AuthUser) {
    return this.listFavoriteExercises.execute(user.userId);
  }

  // PUT /api/exercises/:id/favorite — marca com estrela (idempotente)
  @Put(':id/favorite')
  favorite(@CurrentUser() user: AuthUser, @Param('id') exerciseId: string) {
    return this.addFavoriteExercise.execute(user.userId, exerciseId);
  }

  // DELETE /api/exercises/:id/favorite — tira a estrela (idempotente)
  @Delete(':id/favorite')
  unfavorite(@CurrentUser() user: AuthUser, @Param('id') exerciseId: string) {
    return this.removeFavoriteExercise.execute(user.userId, exerciseId);
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
