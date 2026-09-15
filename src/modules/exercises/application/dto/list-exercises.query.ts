import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '../../infrastructure/prisma-exercise.repository';

export class ListExercisesQuery {
  @IsOptional()
  @IsString()
  muscleGroup?: string; // nome do grupo (body_part slug) ou id

  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  equipment?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** Máximo por página = MAX_PAGE_SIZE (200). Acima disso o request é rejeitado. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}
