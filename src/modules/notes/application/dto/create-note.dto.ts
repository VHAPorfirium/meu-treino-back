import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  toId: string; // aluno (TRAINEE) destinatário

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text: string;
}
