import { Role } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SwitchProfileDto {
  @IsEnum(Role, { message: 'Perfil de destino inválido' })
  role: Role;
}
