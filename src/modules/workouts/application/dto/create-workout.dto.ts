import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateWorkoutDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number; // 0=domingo ... 6=sábado

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
