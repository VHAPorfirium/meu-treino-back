import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AddExerciseDto {
  @IsString()
  exerciseId: string;

  @IsInt()
  @Min(1)
  order: number;

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
