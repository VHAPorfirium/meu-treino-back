import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ExerciseStatus } from '@prisma/client';

export class PatchExerciseLogDto {
  @IsEnum(ExerciseStatus)
  status: ExerciseStatus;

  // obrigatório quando status = REPLACED (validado no use-case)
  @IsOptional()
  @IsString()
  actualExerciseId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loadUsed?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  setsCompleted?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
