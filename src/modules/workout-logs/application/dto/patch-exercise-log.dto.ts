import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExerciseStatus } from '@prisma/client';

/** E4 — uma série executada. */
export class SetLogDto {
  @IsInt()
  @Min(1)
  @Max(50)
  setNumber: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2000)
  weight?: number; // kg

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  reps?: number;
}

export class PatchExerciseLogDto {
  @IsEnum(ExerciseStatus)
  status: ExerciseStatus;

  // obrigatório quando status = REPLACED (validado no use-case)
  @IsOptional()
  @IsString()
  actualExerciseId?: string;

  // Compat: carga única. Se `sets` vier, estes dois são DERIVADOS das séries.
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
  @MaxLength(500)
  note?: string;

  /**
   * E4 — séries executadas. Semântica REPLACE: o array substitui todas as séries
   * já registradas deste exercício nesta sessão (mantém o PATCH idempotente → offline).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SetLogDto)
  sets?: SetLogDto[];
}
