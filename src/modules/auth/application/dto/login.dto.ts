import { IsString, Matches } from 'class-validator';

export class LoginDto {
  // Login por PIN: o próprio PIN identifica o usuário (não escolhemos mais o papel).
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'O PIN deve ter de 4 a 8 números' })
  pin: string;
}
