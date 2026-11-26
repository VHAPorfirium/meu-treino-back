import { IsBoolean } from 'class-validator';

export class SetUserActiveDto {
  @IsBoolean({ message: 'O campo active deve ser booleano' })
  active: boolean;
}
