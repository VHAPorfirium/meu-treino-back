import { Type } from 'class-transformer';
import { ExerciseMode } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_DURACAO_SEGUNDOS } from './add-exercise.dto';

/**
 * Um item do lote. Repare que **não tem `order`**: quem decide a posição é o
 * servidor, sequencialmente a partir do último exercício do treino. Deixar o
 * cliente mandar `order` num lote é pedir colisão e buraco na numeração.
 */
export class AddExerciseItemDto {
  @IsString()
  exerciseId: string;

  // E10 — REPS (padrão) ou TIME
  @IsOptional()
  @IsEnum(ExerciseMode)
  mode?: ExerciseMode;

  // obrigatório no modo REPS (contrato antigo); em TIME vira 1 se não vier
  @ValidateIf((o: AddExerciseItemDto) => o.mode !== ExerciseMode.TIME)
  @IsInt()
  @Min(1)
  sets?: number;

  @ValidateIf((o: AddExerciseItemDto) => o.mode !== ExerciseMode.TIME)
  @IsString()
  reps?: string; // ex: "10-12"

  @ValidateIf((o: AddExerciseItemDto) => o.mode === ExerciseMode.TIME)
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

export class AddExercisesBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50) // teto defensivo: o montador do admin não passa disso
  @ValidateNested({ each: true })
  @Type(() => AddExerciseItemDto)
  items: AddExerciseItemDto[];
}
