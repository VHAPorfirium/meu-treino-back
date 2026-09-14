import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReorderItemDto {
  @IsString()
  workoutExerciseId: string;

  @IsInt()
  @Min(1)
  order: number;
}

/** Nova ordem completa dos exercícios do treino (todos os ids, `order` 1..n). */
export class ReorderExercisesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}
