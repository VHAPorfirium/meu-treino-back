import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateWorkoutExerciseDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  sets?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  reps?: string; // ex: "10-12"

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
