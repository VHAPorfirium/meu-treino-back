import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RequestLinkDto {
  /** Apelido (`username`, ex.: `gabriel.silva`) informado pelo aluno ao personal. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Informe o apelido (@username) do aluno' })
  @MaxLength(40)
  username: string;
}
