import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic'] as const;

/** Pede uma URL assinada pra subir 1 foto. */
export class RequestUploadDto {
  @IsIn(PHOTO_EXTENSIONS)
  ext: (typeof PHOTO_EXTENSIONS)[number];
}

/** Depois do upload, registra a foto (o `path` é o devolvido em RequestUpload). */
export class RegisterPhotoDto {
  @IsString()
  @MaxLength(300)
  @Matches(/^[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.(jpg|jpeg|png|webp|heic)$/)
  path: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsISO8601()
  takenAt?: string;
}
