import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTraineeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres' })
  @MaxLength(60, { message: 'O nome deve ter no máximo 60 caracteres' })
  name: string;

  /** CPF brasileiro (11 dígitos, com ou sem máscara). Validado módulo 11 no use-case. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Informe o CPF' })
  @MaxLength(20)
  cpf: string;

  /** Senha inicial forte (8+ chars, letra, número e especial). Exigirá troca no 1º acesso. */
  @IsString()
  @IsNotEmpty({ message: 'Informe a senha inicial' })
  @MaxLength(128)
  password: string;

  /** Apelido opcional (`primeiro.ultimo`). Se omitido, é gerado automaticamente sem colisões. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(40)
  username?: string;

  /** Papel da conta (padrão TRAINEE; apenas ADMIN pode criar PERSONAL/RECEPTION/ADMIN). */
  @IsOptional()
  @IsEnum(Role, { message: 'Perfil inválido' })
  role?: Role;
}
