import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthUser, JwtPayload } from './jwt-payload';
import { getJwtSecret } from './jwt-secret';
import { UserStatusCacheService } from './user-status-cache.service';

export const AUTH_COOKIE = 'mt_token';

// Extrai o JWT do cookie httpOnly; cai pro header Authorization (útil p/ curl/testes).
function fromCookie(req: Request): string | null {
  return req?.cookies?.[AUTH_COOKIE] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userStatus: UserStatusCacheService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const status = await this.userStatus.get(payload.sub);
    if (!status || !status.active) {
      throw new UnauthorizedException('Conta desativada');
    }
    const tokenVersion = payload.tv ?? 0;
    const currentVersion = status.tokenVersion ?? 0;
    if (tokenVersion !== currentVersion) {
      throw new UnauthorizedException('Sessão revogada. Faça login novamente.');
    }
    return {
      userId: status.id,
      role: status.role,
      name: status.name,
      username: status.username,
      mustChangePassword: status.mustChangePassword,
    };
  }
}
