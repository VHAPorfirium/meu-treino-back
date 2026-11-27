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
import { AllowPendingPasswordChange } from '../../shared/auth/allow-pending-password-change.decorator';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { AUTH_COOKIE } from '../../shared/auth/jwt.strategy';
import { SecurityLogger } from '../../shared/security/security-logger';
import { clientIp, requestId, userAgent } from '../../shared/http/client-ip';
import { LoginDto } from './application/dto/login.dto';
import { ChangePasswordDto } from './application/dto/change-password.dto';
import { SwitchProfileDto } from './application/dto/switch-profile.dto';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { SwitchProfileUseCase } from './application/use-cases/switch-profile.use-case';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/**
 * Opções compartilhadas entre `res.cookie` e `res.clearCookie`.
 * Em produção (`NODE_ENV=production`), `secure` é `true` por padrão (fail-safe)
 * salvo quando `COOKIE_SECURE=false` for explicitamente definido.
 */
function authCookieOptions() {
  const raw = process.env.COOKIE_SECURE?.trim();
  const secure =
    raw !== undefined && raw !== ''
      ? raw === 'true'
      : process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly switchProfileUseCase: SwitchProfileUseCase,
    private readonly security: SecurityLogger,
  ) {}

  // POST /api/auth/login { identifier, password, role? } — login O(1) por CPF (ou apelido legado sem CPF)
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
      userAgent: userAgent(req),
      requestId: requestId(req),
    });

    if (result.requiresProfileSelection) {
      return result;
    }

    res.cookie(AUTH_COOKIE, result.token, {
      ...authCookieOptions(),
      maxAge: THIRTY_DAYS,
    });

    return { user: result.user };
  }

  // GET /api/auth/linked-profiles — lista outros perfis ativos no mesmo CPF (PERSONAL <-> TRAINEE)
  @Get('linked-profiles')
  linkedProfiles(@CurrentUser() user: AuthUser) {
    return this.switchProfileUseCase.listLinkedProfiles(user.userId);
  }

  // POST /api/auth/switch-profile { role } — troca de perfil ativo mantendo o mesmo CPF
  @Post('switch-profile')
  @HttpCode(200)
  async switchProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: SwitchProfileDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.switchProfileUseCase.execute(user.userId, dto.role, {
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: requestId(req),
    });

    res.cookie(AUTH_COOKIE, result.token, {
      ...authCookieOptions(),
      maxAge: THIRTY_DAYS,
    });

    return { user: result.user };
  }

  // POST /api/auth/change-password — troca de senha (primeiro acesso ou voluntária)
  // Revoga todos os tokens antigos (incremento de tokenVersion) e reemite cookie novo para esta sessão.
  @AllowPendingPasswordChange()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.changePasswordUseCase.execute(user.userId, dto, {
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: requestId(req),
    });

    if (result.token) {
      res.cookie(AUTH_COOKIE, result.token, {
        ...authCookieOptions(),
        maxAge: THIRTY_DAYS,
      });
    }

    return { ok: result.ok, mustChangePassword: result.mustChangePassword };
  }

  // POST /api/auth/logout — limpa o cookie httpOnly
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, authCookieOptions());
    this.security.event('auth.logout', {
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: requestId(req),
      method: 'POST',
      path: '/api/auth/logout',
      statusCode: 200,
    });
    return { ok: true };
  }

  // GET /api/auth/me — valida a sessão e devolve o usuário atual (estado atualizado)
  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
