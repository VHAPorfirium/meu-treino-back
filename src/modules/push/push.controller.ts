import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { PushService } from './application/push.service';
import { SubscribeDto, UnsubscribeDto } from './application/dto/subscribe.dto';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  // GET /api/push/public-key — chave VAPID pública (null se push desabilitado)
  @Get('public-key')
  publicKey() {
    return { publicKey: this.push.publicKey(), enabled: this.push.isEnabled() };
  }

  // POST /api/push/subscribe — registra o dispositivo do usuário logado
  @Post('subscribe')
  @HttpCode(200)
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeDto) {
    return this.push.subscribe(user.userId, dto);
  }

  // DELETE /api/push/subscribe — remove o dispositivo
  @Delete('subscribe')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribeDto) {
    return this.push.unsubscribe(user.userId, dto.endpoint);
  }
}
