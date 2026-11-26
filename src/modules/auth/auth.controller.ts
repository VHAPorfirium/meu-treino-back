import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../shared/auth/public.decorator';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { AUTH_COOKIE } from '../../shared/auth/jwt.strategy';
import { SecurityLogger } from '../../shared/security/security-logger';
import { clientIp, requestId } from '../../shared/http/client-ip';
import { LoginDto } from './application/dto/login.dto';
import { LoginUseCase } from './application/use-cases/login.use-case';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/**
 * Opções compartilhadas entre `res.cookie` e `res.clearCookie`.
 * Como o frontend proxia `/api/*` no mesmo domínio (Next rewrites), o cookie é
 * first-party: `sameSite: 'lax'` mitiga CSRF em `<form>` cross-site e funciona
 * em todos os navegadores (incluindo iOS/Safari). Reutilizar exatamente as mesmas
 * opções em `clearCookie` evita que o navegador ignore o logout em produção.
 */
function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly security: SecurityLogger,
  ) {}

  // POST /api/auth/login  { pin }  — identifica o usuário pelo PIN
  // Rate limit estrito: 10 tentativas/min por IP (além do lockout de brute-force)
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @HttpCode(200)
  async signIn(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.login.execute(dto, {
      ip: clientIp(req),
      requestId: requestId(req),
    });

    res.cookie(AUTH_COOKIE, result.token, {
      ...authCookieOptions(),
      maxAge: THIRTY_DAYS,
    });

    return { user: result.user };
  }

  // POST /api/auth/logout — limpa o cookie httpOnly
  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, authCookieOptions());
    this.security.event('auth.logout', {
      ip: clientIp(req),
      requestId: requestId(req),
    });
    return { ok: true };
  }

  // GET /api/auth/me — valida a sessão e devolve o usuário atual
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
