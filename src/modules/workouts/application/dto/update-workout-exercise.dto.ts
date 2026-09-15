import { ExerciseMode } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_DURACAO_SEGUNDOS } from './add-exercise.dto';

export class UpdateWorkoutExerciseDto {
  // E10 — trocar o modo do exercício já montado (ex.: prancha de reps p/ tempo)
  @IsOptional()
  @IsEnum(ExerciseMode)
  mode?: ExerciseMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  sets?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  reps?: string | null; // ex: "10-12" · null no modo TIME

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_DURACAO_SEGUNDOS)
  durationSeconds?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  restSeconds?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  notes?: string | null;
}
