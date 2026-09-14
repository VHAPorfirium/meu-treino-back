import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import {
  USER_REPOSITORY,
  UserRepository,
} from '../../../users/domain/user.repository';
import { LoginDto } from '../dto/login.dto';
import { JwtPayload } from '../../../../shared/auth/jwt-payload';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { LoginThrottleService } from '../../../../shared/security/login-throttle.service';

export interface LoginContext {
  ip: string;
  requestId?: string;
}

export interface LoginResult {
  token: string;
  user: { id: string; name: string; role: string };
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly jwt: JwtService,
    private readonly security: SecurityLogger,
    private readonly throttle: LoginThrottleService,
  ) {}

  async execute(dto: LoginDto, ctx: LoginContext): Promise<LoginResult> {
    const startedAt = Date.now();
    // Login por PIN: a chave de brute-force é o IP (+ um teto global, ver LoginThrottleService).
    const key = this.throttle.key(ctx.ip);

    // 1) já está bloqueado por brute-force (por IP ou globalmente)?
    const status = this.throttle.status(key);
    if (status.locked) {
      this.security.event('auth.login.locked', {
        ip: ctx.ip,
        requestId: ctx.requestId,
        reason: 'lockout ativo',
        attempt: status.attempts,
        retryAfterSec: status.retryAfterSec,
        scope: status.scope,
      });
      throw new HttpException(
        `Muitas tentativas. Tente novamente em ${status.retryAfterSec}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const fail = (reason: string) => {
      const { attempts, lockedNow, scope } = this.throttle.recordFailure(key);
      this.security.event('auth.login.failure', {
        ip: ctx.ip,
        requestId: ctx.requestId,
        reason,
        attempt: attempts,
        durationMs: Date.now() - startedAt,
      });
      if (lockedNow) {
        this.security.event('auth.login.locked', {
          ip: ctx.ip,
          requestId: ctx.requestId,
          reason: 'limite de tentativas atingido',
          attempt: attempts,
          scope,
        });
      }
      throw new UnauthorizedException('Credenciais inválidas');
    };

    // Procura o usuário cujo PIN bate. Percorre todos e valida o hash argon2.
    // Volume é minúsculo (poucos usuários), então o custo é irrelevante.
    const users = await this.users.findAll();
    let matched: (typeof users)[number] | null = null;
    for (const u of users) {
      const ok = await argon2.verify(u.pinHash, dto.pin).catch(() => false);
      if (ok) {
        matched = u;
        break;
      }
    }
    if (!matched) return fail('PIN incorreto');

    // sucesso: limpa o bucket do IP e registra
    this.throttle.reset(key);
    const payload: JwtPayload = {
      sub: matched.id,
      role: matched.role,
      name: matched.name,
    };
    const token = await this.jwt.signAsync(payload);

    this.security.event('auth.login.success', {
      ip: ctx.ip,
      role: matched.role,
      userId: matched.id,
      requestId: ctx.requestId,
      durationMs: Date.now() - startedAt,
    });

    return {
      token,
      user: { id: matched.id, name: matched.name, role: matched.role },
    };
  }
}
