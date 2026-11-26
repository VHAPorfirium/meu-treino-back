import { Role } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  /**
   * CPF (com ou sem máscara: `000.000.000-00` / `00000000000`) ou apelido legado
   * (`username`) temporário exclusivamente para contas da v1.0 ainda sem CPF cadastrado.
   */
  @IsString()
  @IsNotEmpty({ message: 'Informe seu CPF ou apelido de acesso' })
  @MaxLength(64, { message: 'Identificador inválido' })
  identifier: string;

  /**
   * Senha alfanumérica forte (8+ chars) — também aceita PIN legado da v1.0 no primeiro
   * acesso, marcando `mustChangePassword: true` para obrigar a atualização imediata.
   */
  @IsString()
  @IsNotEmpty({ message: 'Informe sua senha' })
  @MaxLength(128, { message: 'Senha inválida' })
  password: string;

  /**
   * Perfil escolhido quando o mesmo CPF possui mais de uma conta ativa com a mesma senha
   * (ex.: pessoa que é `PERSONAL` e também `TRAINEE` na academia).
   */
  @IsOptional()
  @IsEnum(Role, { message: 'Perfil inválido' })
  role?: Role;
}
