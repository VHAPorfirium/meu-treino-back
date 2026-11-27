import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  USER_REPOSITORY,
  UserRepository,
} from '../../../users/domain/user.repository';
import { LoginDto } from '../dto/login.dto';
import { JwtPayload } from '../../../../shared/auth/jwt-payload';
import { UserStatusCacheService } from '../../../../shared/auth/user-status-cache.service';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { LoginThrottleService } from '../../../../shared/security/login-throttle.service';
import { CryptoService } from '../../../../shared/security/crypto.service';
import {
  isValidCpf,
  maskIdentifier,
  normalizeCpf,
  normalizeUsername,
  validateStrongPassword,
} from '../../../../shared/security/cpf-and-password';

export interface LoginContext {
  ip: string;
  userAgent?: string;
  requestId?: string;
}

export interface ProfileChoice {
  role: Role;
  name: string;
  username: string;
}

export type LoginResult =
  | {
      requiresProfileSelection?: false;
      token: string;
      user: {
        id: string;
        name: string;
        username: string;
        role: Role;
        mustChangePassword: boolean;
      };
    }
  | {
      requiresProfileSelection: true;
      profiles: ProfileChoice[];
    };

let dummyHashPromise: Promise<string> | null = null;

/**
 * Hash argon2id fixo (gerado uma vez por processo) verificado sempre que o usuário
 * não existe, equalizando o tempo de resposta contra enumeração por timing attack.
 */
function getDummyArgonHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash('ritmo-anti-timing-dummy-secret-v1', {
      type: argon2.argon2id,
    });
  }
  return dummyHashPromise;
}

function looksLikeCpf(raw: string): boolean {
  const trimmed = raw.trim();
  return /^[\d.\-\s/]+$/.test(trimmed) && normalizeCpf(trimmed).length === 11;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly jwt: JwtService,
    private readonly security: SecurityLogger,
    private readonly throttle: LoginThrottleService,
    private readonly crypto: CryptoService,
    @Optional() private readonly userStatusCache?: UserStatusCacheService,
  ) {}

  async execute(dto: LoginDto, ctx: LoginContext): Promise<LoginResult> {
    const startedAt = Date.now();
    const rawIdentifier = dto.identifier.trim();
    const cpfMode = looksLikeCpf(rawIdentifier);
    const cpfDigits = cpfMode ? normalizeCpf(rawIdentifier) : '';
    const identifierMasked = maskIdentifier(rawIdentifier);

    // Chave de brute-force por (IP + identificador) evita que um aluno no Wi-Fi da
    // academia bloqueie outros alunos; o teto global (30/min) barra credential spraying.
    // Nunca guardamos CPF em texto puro no bucket em memória (usamos prefixo do HMAC).
    const throttleIdentifier = cpfMode
      ? this.crypto.hashCpf(cpfDigits).slice(0, 16)
      : normalizeUsername(rawIdentifier) || 'invalid';
    const key = this.throttle.key(ctx.ip, throttleIdentifier);

    // 1) Verifica lockout e reserva vaga sincronamente (fecha janela TOCTOU).
    const status = this.throttle.acquireAttempt(key);
    if (status.locked) {
      this.security.event('auth.login.locked', {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        identifierMasked,
        requestId: ctx.requestId,
        method: 'POST',
        path: '/api/auth/login',
        statusCode: 429,
        reason: 'lockout_active',
        attempt: status.attempts,
        retryAfterSec: status.retryAfterSec,
        scope: status.scope,
      });
      throw new HttpException(
        `Muitas tentativas. Tente novamente em ${status.retryAfterSec}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let settled = false;

    const fail = (
      reason: string,
      message = 'Credenciais inválidas',
      extra?: { userId?: string; role?: string },
    ): never => {
      settled = true;
      const { attempts, lockedNow, scope } = this.throttle.completeFailure(key);
      this.security.event('auth.login.failure', {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        identifierMasked,
        userId: extra?.userId,
        role: extra?.role,
        requestId: ctx.requestId,
        method: 'POST',
        path: '/api/auth/login',
        statusCode: 401,
        reason,
        attempt: attempts,
        durationMs: Date.now() - startedAt,
      });
      if (lockedNow) {
        this.security.event('auth.login.locked', {
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          identifierMasked,
          requestId: ctx.requestId,
          method: 'POST',
          path: '/api/auth/login',
          statusCode: 429,
          reason: 'max_attempts_reached',
          attempt: attempts,
          scope,
        });
      }
      throw new UnauthorizedException(message);
    };

    try {
      // 2) Busca O(1) por blind index HMAC-SHA256 do CPF (pode retornar 1..2 contas
      //    quando a mesma pessoa tem perfil PERSONAL e TRAINEE com o mesmo CPF).
      //    Fallback legado por `username` é aceito SOMENTE para contas sem `cpfHash`.
      let candidates: User[] = [];
      if (cpfMode) {
        if (isValidCpf(cpfDigits)) {
          candidates = await this.users.findManyByCpfHash(
            this.crypto.hashCpf(cpfDigits),
          );
          if (dto.role) {
            candidates = candidates.filter((u) => u.role === dto.role);
          }
        }
      } else {
        const normalizedUsername = normalizeUsername(rawIdentifier);
        if (normalizedUsername) {
          const candidate = await this.users.findByUsername(normalizedUsername);
          if (candidate && candidate.cpfHash === null) {
            candidates = [candidate];
          }
        }
      }

      // 3) Anti-timing attack: executa argon2.verify mesmo quando nenhuma conta existe.
      if (candidates.length === 0) {
        const dummyHash = await getDummyArgonHash();
        await argon2.verify(dummyHash, dto.password).catch(() => false);
        return fail('invalid_credentials');
      }

      // 4) Verifica a senha em todos os perfis candidatos (no máx. 1–2 contas por CPF).
      const matched: User[] = [];
      for (const candidate of candidates) {
        const ok = await argon2
          .verify(candidate.pinHash, dto.password)
          .catch(() => false);
        if (ok) matched.push(candidate);
      }

      if (matched.length === 0) {
        return fail('invalid_credentials', 'Credenciais inválidas', {
          userId: candidates.length === 1 ? candidates[0].id : undefined,
          role: candidates.length === 1 ? candidates[0].role : undefined,
        });
      }

      // 5) Checa contas ativas somente APÓS validar a senha (não vaza status para terceiros).
      const activeMatched = matched.filter((u) => u.active);
      if (activeMatched.length === 0) {
        return fail('account_inactive', 'Conta desativada. Procure a recepção.', {
          userId: matched[0].id,
          role: matched[0].role,
        });
      }

      // 6) Mesmo CPF + mesma senha em múltiplos perfis ativos (ex.: PERSONAL + TRAINEE):
      //    pede escolha de perfil (somente APÓS validar senha, sem vazar contas!).
      if (activeMatched.length > 1) {
        settled = true;
        this.throttle.releaseAttempt(key);
        return {
          requiresProfileSelection: true,
          profiles: activeMatched.map((u) => ({
            role: u.role,
            name: u.name,
            username: u.username,
          })),
        };
      }

      const user = activeMatched[0];

      // 7) Contas legadas (PIN de 4 dígitos) são forçadas a atualizar para senha forte.
      const strongCheck = validateStrongPassword(dto.password);
      let mustChangePassword = user.mustChangePassword || !strongCheck.valid;
      if (!user.mustChangePassword && !strongCheck.valid) {
        await this.users.update(user.id, { mustChangePassword: true });
        this.userStatusCache?.invalidate(user.id);
        mustChangePassword = true;
      }

      settled = true;
      this.throttle.completeSuccess(key);

      const payload: JwtPayload = {
        sub: user.id,
        role: user.role,
        name: user.name,
        username: user.username,
        tv: user.tokenVersion ?? 0,
      };
      const token = await this.jwt.signAsync(payload);

      this.security.event('auth.login.success', {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        identifierMasked,
        role: user.role,
        userId: user.id,
        requestId: ctx.requestId,
        method: 'POST',
        path: '/api/auth/login',
        statusCode: 200,
        durationMs: Date.now() - startedAt,
      });

      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          mustChangePassword,
        },
      };
    } finally {
      if (!settled) {
        this.throttle.releaseAttempt(key);
      }
    }
  }
}
