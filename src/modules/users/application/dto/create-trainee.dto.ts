import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTraineeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  /** Mesmo formato do login: 4 a 8 dígitos. */
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'O PIN deve ter de 4 a 8 números' })
  pin: string;
}
