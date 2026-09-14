import { Injectable } from '@nestjs/common';

interface Bucket {
  fails: number[]; // timestamps (ms) das falhas recentes
  lockedUntil?: number; // ms epoch
}

interface Policy {
  maxFails: number;
  windowMs: number;
  lockMs: number;
}

export interface ThrottleStatus {
  locked: boolean;
  retryAfterSec: number;
  attempts: number;
  scope: 'ip' | 'global';
}

/**
 * Lockout de brute-force em memória, em DUAS camadas:
 *
 *  - por IP:  5 falhas / 1 min  → bloqueia aquele IP por 5 min   (defesa principal)
 *  - global: 30 falhas / 1 min  → bloqueia TODO login por 2 min  (defesa em profundidade)
 *
 * A camada global existe porque o IP pode ser forjado (X-Forwarded-For) ou distribuído
 * (botnet): com PINs de 4 dígitos, um teto global limita o número absoluto de tentativas
 * por minuto independentemente de quantos "IPs" o atacante inventar.
 *
 * Simples de propósito — o objetivo é demonstrar a defesa e gerar eventos pra análise,
 * não ser um store distribuído (se houver +1 instância, mover pra Redis).
 */
@Injectable()
export class LoginThrottleService {
  private readonly buckets = new Map<string, Bucket>();

  private readonly IP_POLICY: Policy = {
    maxFails: 5,
    windowMs: 60_000,
    lockMs: 5 * 60_000,
  };
  private readonly GLOBAL_POLICY: Policy = {
    maxFails: 30,
    windowMs: 60_000,
    lockMs: 2 * 60_000,
  };
  private readonly GLOBAL_KEY = 'login::*';

  key(ip: string): string {
    return `login::${ip}`;
  }

  /** Está bloqueado agora (por IP ou globalmente)? Devolve o escopo que bloqueou. */
  status(key: string): ThrottleStatus {
    const global = this.statusFor(this.GLOBAL_KEY, 'global');
    if (global.locked) return global;
    return this.statusFor(key, 'ip');
  }

  /** Registra uma falha nas duas camadas; devolve o que travou agora (se travou). */
  recordFailure(key: string): {
    attempts: number;
    lockedNow: boolean;
    scope?: 'ip' | 'global';
  } {
    const ip = this.fail(key, this.IP_POLICY);
    const global = this.fail(this.GLOBAL_KEY, this.GLOBAL_POLICY);
    if (ip.lockedNow) return { attempts: ip.attempts, lockedNow: true, scope: 'ip' };
    if (global.lockedNow)
      return { attempts: global.attempts, lockedNow: true, scope: 'global' };
    return { attempts: ip.attempts, lockedNow: false };
  }

  /** Sucesso: zera o bucket daquele IP (o global segue contando só falhas). */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  private statusFor(key: string, scope: 'ip' | 'global'): ThrottleStatus {
    const b = this.buckets.get(key);
    const now = Date.now();
    if (!b) return { locked: false, retryAfterSec: 0, attempts: 0, scope };
    if (b.lockedUntil && b.lockedUntil > now) {
      return {
        locked: true,
        retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000),
        attempts: b.fails.length,
        scope,
      };
    }
    return { locked: false, retryAfterSec: 0, attempts: b.fails.length, scope };
  }

  private fail(key: string, policy: Policy): { attempts: number; lockedNow: boolean } {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { fails: [] };
    b.fails = b.fails.filter((t) => now - t < policy.windowMs);
    b.fails.push(now);
    let lockedNow = false;
    if (b.fails.length >= policy.maxFails && !(b.lockedUntil && b.lockedUntil > now)) {
      b.lockedUntil = now + policy.lockMs;
      lockedNow = true;
    }
    this.buckets.set(key, b);
    return { attempts: b.fails.length, lockedNow };
  }
}
