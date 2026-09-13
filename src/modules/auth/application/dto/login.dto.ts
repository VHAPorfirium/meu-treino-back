import { IsString, Length } from 'class-validator';

export class LoginDto {
  // Login por PIN: o próprio PIN identifica o usuário (não escolhemos mais o papel).
  @IsString()
  @Length(4, 8)
  pin: string;
}
