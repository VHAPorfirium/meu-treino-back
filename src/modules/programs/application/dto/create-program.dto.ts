import { Transform } from 'class-transformer';
import { ProgramType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProgramDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(ProgramType)
  type: ProgramType;

  /** Só para MESOCYCLE. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  targetWeeks?: number;

  /** Só para CHALLENGE. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  targetDays?: number;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  workoutIds: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  userIds: string[];
}
