import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

/** Alunos que passam a participar do programa (os atuais continuam). */
export class AssignProgramDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  userIds: string[];
}
