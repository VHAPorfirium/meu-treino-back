import { Type } from 'class-transformer';
import { IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';

class KeysDto {
  @IsString()
  @MaxLength(200)
  p256dh: string;

  @IsString()
  @MaxLength(100)
  auth: string;
}

/** Objeto PushSubscription.toJSON() do navegador. */
export class SubscribeDto {
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  endpoint: string;

  @ValidateNested()
  @Type(() => KeysDto)
  keys: KeysDto;
}

export class UnsubscribeDto {
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  endpoint: string;
}
