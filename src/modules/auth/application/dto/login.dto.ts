import { IsEnum, IsString, Length } from 'class-validator';
import { Role } from '@prisma/client';

export class LoginDto {
  @IsEnum(Role)
  role: Role;

  @IsString()
  @Length(4, 8)
  pin: string;
}
