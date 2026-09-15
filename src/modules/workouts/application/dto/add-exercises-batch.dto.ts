import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Um item do lote. Repare que **não tem `order`**: quem decide a posição é o
 * servidor, sequencialmente a partir do último exercício do treino. Deixar o
 * cliente mandar `order` num lote é pedir colisão e buraco na numeração.
 */
export class AddExerciseItemDto {
  @IsString()
  exerciseId: string;

  @IsInt()
  @Min(1)
  sets: number;

  @IsString()
  reps: string; // ex: "10-12"

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
