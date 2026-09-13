import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthUser, JwtPayload } from './jwt-payload';

export const AUTH_COOKIE = 'mt_token';

// Extrai o JWT do cookie httpOnly; cai pro header Authorization (útil p/ curl/testes).
function fromCookie(req: Request): string | null {
  return req?.cookies?.[AUTH_COOKIE] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret-troque-em-producao',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    return { userId: payload.sub, role: payload.role, name: payload.name };
  }
}
