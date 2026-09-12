import { IsString } from 'class-validator';

export class OpenSessionDto {
  @IsString()
  workoutId: string;
}
