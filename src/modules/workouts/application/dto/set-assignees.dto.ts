import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

/** Conjunto COMPLETO de destinatários do treino (substitui o anterior). */
export class SetAssigneesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  userIds: string[];
}
