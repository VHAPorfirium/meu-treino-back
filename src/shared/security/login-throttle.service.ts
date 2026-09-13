import { Injectable } from '@nestjs/common';

interface Bucket {
  fails: number[]; // timestamps (ms) das falhas recentes
  lockedUntil?: number; // ms epoch
}

/**
 * Lockout de brute-force por chave (IP + role), em memória.
 * Após MAX_FAILS falhas dentro de WINDOW_MS, bloqueia por LOCK_MS.
 * Simples de propósito — o objetivo é demonstrar a defesa e gerar eventos
 * de segurança pra análise, não ser um store distribuído.
 */
@Injectable()
export class LoginThrottleService {
  private readonly buckets = new Map<string, Bucket>();
  private readonly MAX_FAILS = 5;
  private readonly WINDOW_MS = 60_000; // 1 min
  private readonly LOCK_MS = 5 * 60_000; // 5 min

  key(ip: string, role: string): string {
    return `${ip}::${role}`;
  }

  /** Está bloqueado agora? Retorna segundos restantes se sim. */
  status(key: string): { locked: boolean; retryAfterSec: number; attempts: number } {
    const b = this.buckets.get(key);
    const now = Date.now();
    if (!b) return { locked: false, retryAfterSec: 0, attempts: 0 };
    if (b.lockedUntil && b.lockedUntil > now) {
      return {
        locked: true,
        retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000),
        attempts: b.fails.length,
      };
    }
    return { locked: false, retryAfterSec: 0, attempts: b.fails.length };
  }

  /** Registra uma falha; devolve o nº de tentativas na janela e se travou agora. */
  recordFailure(key: string): { attempts: number; lockedNow: boolean } {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { fails: [] };
    b.fails = b.fails.filter((t) => now - t < this.WINDOW_MS);
    b.fails.push(now);
    let lockedNow = false;
    if (b.fails.length >= this.MAX_FAILS) {
      b.lockedUntil = now + this.LOCK_MS;
      lockedNow = true;
    }
    this.buckets.set(key, b);
    return { attempts: b.fails.length, lockedNow };
  }

  /** Sucesso: zera o bucket. */
  reset(key: string): void {
    this.buckets.delete(key);
  }
}
