import { ExerciseMode } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/** Teto de 4h — protege contra typo (ex.: minutos digitados como segundos). */
export const MAX_DURACAO_SEGUNDOS = 4 * 60 * 60;

export class AddExerciseDto {
  @IsString()
  exerciseId: string;

  @IsInt()
  @Min(1)
  order: number;

  // E10 — REPS (padrão) ou TIME. O modo decide o que é obrigatório abaixo.
  @IsOptional()
  @IsEnum(ExerciseMode)
  mode?: ExerciseMode;

  // obrigatório no modo REPS (contrato antigo); em TIME vira 1 se não vier
  @ValidateIf((o: AddExerciseDto) => o.mode !== ExerciseMode.TIME)
  @IsInt()
  @Min(1)
  sets?: number;

  // obrigatório só no modo REPS — num exercício por tempo não existe "reps"
  @ValidateIf((o: AddExerciseDto) => o.mode !== ExerciseMode.TIME)
  @IsString()
  reps?: string; // ex: "10-12"

  // obrigatório só no modo TIME
  @ValidateIf((o: AddExerciseDto) => o.mode === ExerciseMode.TIME)
  @IsInt()
  @Min(1)
  @Max(MAX_DURACAO_SEGUNDOS)
  durationSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  restSeconds?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
