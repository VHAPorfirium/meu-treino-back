import { IsNotEmpty, IsString } from 'class-validator';

export class LastPerformanceQueryDto {
  @IsString()
  @IsNotEmpty()
  workoutId: string;
}
