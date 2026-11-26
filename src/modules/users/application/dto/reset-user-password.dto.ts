import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ResetUserPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe a nova senha temporária' })
  @MaxLength(128)
  newPassword: string;
}
