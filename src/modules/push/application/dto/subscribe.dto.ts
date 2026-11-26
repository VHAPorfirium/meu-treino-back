import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsNotEmptyObject,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsSafePushEndpoint } from '../push-endpoint.validator';

class KeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  auth: string;
}

/** Objeto PushSubscription.toJSON() do navegador. */
export class SubscribeDto {
  @IsString()
  @MaxLength(1000)
  @IsSafePushEndpoint()
  endpoint: string;

  // Presente como `null` no PushSubscription.toJSON() (especificação W3C):
  // aceito explicitamente para compatibilidade com `forbidNonWhitelisted`.
  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  @IsDefined()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => KeysDto)
  keys: KeysDto;
}

export class UnsubscribeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  endpoint: string;
}
