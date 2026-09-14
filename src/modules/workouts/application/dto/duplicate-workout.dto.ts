import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DuplicateWorkoutDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string; // default: "<nome original> (cópia)"

  @IsOptional()
  @IsBoolean()
  copyAssignees?: boolean; // default: false
}
