import { Injectable } from '@nestjs/common';

interface Bucket {
  fails: number[]; // timestamps (ms) das falhas recentes
  inFlight: number; // tentativas concorrentes ainda executando argon2
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
 * Também contabiliza tentativas concorrentes (`inFlight`) antes do `argon2.verify` para
 * eliminar a janela TOCTOU: uma rajada paralela não consegue passar além do orçamento
 * restante do IP nem do teto global.
 *
 * Simples de propósito — o objetivo é demonstrar a defesa e gerar eventos pra análise,
 * não ser um store distribuído (se houver +1 instância, mover pra Redis).
 */
@Injectable()
export class LoginThrottleService {
  private readonly buckets = new Map<string, Bucket>();
  private lastPruneAt = 0;

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
  private readonly PRUNE_INTERVAL_MS = 60_000;
  private readonly MAX_TRACKED_KEYS = 10_000;

  key(ip: string): string {
    return `login::${ip}`;
  }

  /** Quantidade atual de buckets rastreados (útil para diagnóstico/testes). */
  size(): number {
    return this.buckets.size;
  }

  /** Está bloqueado agora (por IP ou globalmente)? Devolve o escopo que bloqueou. */
  status(key: string): ThrottleStatus {
    const global = this.statusFor(this.GLOBAL_KEY, 'global', false);
    if (global.locked) return global;
    return this.statusFor(key, 'ip', false);
  }

  /**
   * Reserva sincronamente uma vaga antes de executar `argon2.verify`.
   * Se `fails + inFlight` já atingiu o teto (global ou por IP), bloqueia de imediato
   * sem alocar vaga, fechando a janela TOCTOU contra rajadas paralelas.
   */
  acquireAttempt(key: string): ThrottleStatus {
    const now = Date.now();
    this.maybePrune(now);

    const global = this.statusFor(this.GLOBAL_KEY, 'global', true, now);
    if (global.locked) return global;

    const ip = this.statusFor(key, 'ip', true, now);
    if (ip.locked) return ip;

    this.incrementInFlight(key);
    this.incrementInFlight(this.GLOBAL_KEY);
    return ip;
  }

  /** Conclui uma tentativa reservada com falha: libera `inFlight` e contabiliza a falha. */
  completeFailure(key: string): {
    attempts: number;
    lockedNow: boolean;
    scope?: 'ip' | 'global';
  } {
    this.decrementInFlight(key, false);
    this.decrementInFlight(this.GLOBAL_KEY, false);
    return this.recordFailure(key);
  }

  /** Conclui uma tentativa reservada com sucesso: libera `inFlight` e zera falhas do IP. */
  completeSuccess(key: string): void {
    this.decrementInFlight(this.GLOBAL_KEY, false);
    const b = this.buckets.get(key);
    if (!b) return;
    b.inFlight = Math.max(0, b.inFlight - 1);
    b.fails = [];
    b.lockedUntil = undefined;
    if (b.inFlight === 0) {
      this.buckets.delete(key);
    }
  }

  /** Libera uma vaga reservada em caso de erro inesperado (ex.: queda do banco) sem contar falha. */
  releaseAttempt(key: string): void {
    this.decrementInFlight(key, true);
    this.decrementInFlight(this.GLOBAL_KEY, false);
  }

  /** Registra uma falha nas duas camadas; devolve o que travou agora (se travou). */
  recordFailure(key: string): {
    attempts: number;
    lockedNow: boolean;
    scope?: 'ip' | 'global';
  } {
    const now = Date.now();
    this.maybePrune(now);
    const ip = this.fail(key, this.IP_POLICY, now);
    const global = this.fail(this.GLOBAL_KEY, this.GLOBAL_POLICY, now);
    if (ip.lockedNow) return { attempts: ip.attempts, lockedNow: true, scope: 'ip' };
    if (global.lockedNow)
      return { attempts: global.attempts, lockedNow: true, scope: 'global' };
    return { attempts: ip.attempts, lockedNow: false };
  }

  /** Sucesso: zera o bucket daquele IP (o global segue contando só falhas). */
  reset(key: string): void {
    const b = this.buckets.get(key);
    if (!b) return;
    if (b.inFlight > 0) {
      b.fails = [];
      b.lockedUntil = undefined;
      return;
    }
    this.buckets.delete(key);
  }

  private statusFor(
    key: string,
    scope: 'ip' | 'global',
    includeInFlight: boolean,
    now = Date.now(),
  ): ThrottleStatus {
    const b = this.buckets.get(key);
    if (!b) return { locked: false, retryAfterSec: 0, attempts: 0, scope };
    const policy = scope === 'global' ? this.GLOBAL_POLICY : this.IP_POLICY;
    if (b.lockedUntil && b.lockedUntil > now) {
      return {
        locked: true,
        retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000),
        attempts: b.fails.length,
        scope,
      };
    }
    const recentFails = b.fails.filter((t) => now - t < policy.windowMs);
    if (recentFails.length === 0 && b.inFlight === 0 && key !== this.GLOBAL_KEY) {
      this.buckets.delete(key);
      return { locked: false, retryAfterSec: 0, attempts: 0, scope };
    }
    b.fails = recentFails;
    if (includeInFlight && b.fails.length + b.inFlight >= policy.maxFails) {
      return {
        locked: true,
        retryAfterSec: Math.ceil(policy.lockMs / 1000),
        attempts: b.fails.length + b.inFlight,
        scope,
      };
    }
    return { locked: false, retryAfterSec: 0, attempts: b.fails.length, scope };
  }

  private incrementInFlight(key: string): void {
    const b = this.buckets.get(key) ?? { fails: [], inFlight: 0 };
    b.inFlight += 1;
    // Reinsere para manter ordem de uso recente (LRU simples no Map)
    this.buckets.delete(key);
    this.buckets.set(key, b);
  }

  private decrementInFlight(key: string, cleanupIfIdle: boolean): void {
    const b = this.buckets.get(key);
    if (!b) return;
    b.inFlight = Math.max(0, b.inFlight - 1);
    if (
      cleanupIfIdle &&
      key !== this.GLOBAL_KEY &&
      b.inFlight === 0 &&
      b.fails.length === 0 &&
      !(b.lockedUntil && b.lockedUntil > Date.now())
    ) {
      this.buckets.delete(key);
    }
  }

  private fail(
    key: string,
    policy: Policy,
    now: number,
  ): { attempts: number; lockedNow: boolean } {
    const b = this.buckets.get(key) ?? { fails: [], inFlight: 0 };
    b.fails = b.fails.filter((t) => now - t < policy.windowMs);
    b.fails.push(now);
    let lockedNow = false;
    if (b.fails.length >= policy.maxFails && !(b.lockedUntil && b.lockedUntil > now)) {
      b.lockedUntil = now + policy.lockMs;
      lockedNow = true;
    }
    // Reinsere para manter ordem de uso recente (LRU simples no Map)
    this.buckets.delete(key);
    this.buckets.set(key, b);
    return { attempts: b.fails.length, lockedNow };
  }

  private maybePrune(now: number): void {
    if (
      now - this.lastPruneAt < this.PRUNE_INTERVAL_MS &&
      this.buckets.size < this.MAX_TRACKED_KEYS
    ) {
      return;
    }
    this.lastPruneAt = now;
    for (const [k, b] of this.buckets.entries()) {
      if (k === this.GLOBAL_KEY) continue;
      const locked = Boolean(b.lockedUntil && b.lockedUntil > now);
      if (locked || b.inFlight > 0) continue;
      const hasRecentFail = b.fails.some((t) => now - t < this.IP_POLICY.windowMs);
      if (!hasRecentFail) this.buckets.delete(k);
    }
    // Teto rígido contra ataques distribuídos com milhares de IPs únicos na mesma janela
    if (this.buckets.size >= this.MAX_TRACKED_KEYS) {
      const overflow = this.buckets.size - this.MAX_TRACKED_KEYS + 1;
      let removed = 0;
      for (const [k, b] of this.buckets.entries()) {
        if (k === this.GLOBAL_KEY || b.inFlight > 0) continue;
        this.buckets.delete(k);
        removed++;
        if (removed >= overflow) break;
      }
    }
  }
}
