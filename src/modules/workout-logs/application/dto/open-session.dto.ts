import { IsNotEmpty, IsString } from 'class-validator';

export class OpenSessionDto {
  @IsString()
  @IsNotEmpty()
  workoutId: string;
}
