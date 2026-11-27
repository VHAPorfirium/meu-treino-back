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

export type ThrottleScope = 'ip' | 'spray' | 'global';

export interface ThrottleStatus {
  locked: boolean;
  retryAfterSec: number;
  attempts: number;
  scope: ThrottleScope;
}

export interface ThrottleFailureResult {
  attempts: number;
  lockedNow: boolean;
  scope?: ThrottleScope;
  /** Telemetria: o volume GLOBAL de falhas cruzou o limiar nesta janela (nunca bloqueia). */
  globalAlert?: boolean;
}

/**
 * Lockout de brute-force em memória, em camadas:
 *
 *  - `ip`    (IP + identificador):  5 falhas / 1 min → bloqueia esse par por 5 min
 *  - `spray` (IP agregado):        15 falhas / 1 min → bloqueia SÓ aquele IP por 5 min
 *            (password spraying: um IP testando vários CPFs/usuários)
 *  - `global` (telemetria):        30 falhas / 1 min → apenas sinaliza `globalAlert`
 *            para log/alerta. NUNCA bloqueia logins de outros IPs — o lockout global
 *            anterior permitia que 3 IPs derrubassem o login da academia inteira (DoS),
 *            inclusive ADMIN/RECEPTION.
 *
 * Também contabiliza tentativas concorrentes (`inFlight`) antes do `argon2.verify` para
 * eliminar a janela TOCTOU: uma rajada paralela não passa além do orçamento restante.
 *
 * Simples de propósito — não é um store distribuído (se houver +1 instância, mover pra Redis).
 */
@Injectable()
export class LoginThrottleService {
  private readonly buckets = new Map<string, Bucket>();
  private lastPruneAt = 0;
  private globalAlertUntil = 0;

  private readonly IP_POLICY: Policy = {
    maxFails: 5,
    windowMs: 60_000,
    lockMs: 5 * 60_000,
  };
  private readonly SPRAY_POLICY: Policy = {
    maxFails: 15,
    windowMs: 60_000,
    lockMs: 5 * 60_000,
  };
  private readonly GLOBAL_ALERT_THRESHOLD = 30;
  private readonly GLOBAL_WINDOW_MS = 60_000;
  private readonly GLOBAL_KEY = 'login::*';
  private readonly PRUNE_INTERVAL_MS = 60_000;
  private readonly MAX_TRACKED_KEYS = 10_000;

  /** Chave do par (IP + identificador). `|` não aparece em IPs (v4/v6) nem no identificador normalizado. */
  key(ip: string, identifier?: string): string {
    const normalized = identifier?.trim().toLowerCase().replace(/\|/g, '');
    return normalized ? `login::${ip}|${normalized}` : `login::${ip}`;
  }

  /** Quantidade atual de buckets rastreados (útil para diagnóstico/testes). */
  size(): number {
    return this.buckets.size;
  }

  /** Está bloqueado agora (pelo par IP+identificador ou pelo IP agregado)? */
  status(key: string): ThrottleStatus {
    const spray = this.statusFor(this.sprayKeyOf(key), 'spray', false);
    if (spray.locked) return spray;
    return this.statusFor(key, 'ip', false);
  }

  /**
   * Reserva sincronamente uma vaga antes de executar `argon2.verify`.
   * Se `fails + inFlight` já atingiu o teto (do par ou do IP agregado), bloqueia de
   * imediato sem alocar vaga, fechando a janela TOCTOU contra rajadas paralelas.
   */
  acquireAttempt(key: string): ThrottleStatus {
    const now = Date.now();
    this.maybePrune(now);

    const sprayKey = this.sprayKeyOf(key);
    const spray = this.statusFor(sprayKey, 'spray', true, now);
    if (spray.locked) return spray;

    const ip = this.statusFor(key, 'ip', true, now);
    if (ip.locked) return ip;

    this.incrementInFlight(key);
    this.incrementInFlight(sprayKey);
    return ip;
  }

  /** Conclui uma tentativa reservada com falha: libera `inFlight` e contabiliza a falha. */
  completeFailure(key: string): ThrottleFailureResult {
    this.decrementInFlight(key, false);
    this.decrementInFlight(this.sprayKeyOf(key), false);
    return this.recordFailure(key);
  }

  /** Conclui uma tentativa reservada com sucesso: libera `inFlight` e zera falhas do par. */
  completeSuccess(key: string): void {
    // O agregado do IP não é zerado: um acerto não "limpa" um spray em andamento.
    this.decrementInFlight(this.sprayKeyOf(key), true);
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
    this.decrementInFlight(this.sprayKeyOf(key), true);
  }

  /** Registra uma falha nas camadas; devolve o que travou agora (se travou). */
  recordFailure(key: string): ThrottleFailureResult {
    const now = Date.now();
    this.maybePrune(now);
    const ip = this.fail(key, this.IP_POLICY, now);
    const spray = this.fail(this.sprayKeyOf(key), this.SPRAY_POLICY, now);
    const globalAlert = this.recordGlobalTelemetry(now);

    const extra = globalAlert ? { globalAlert: true } : {};
    if (ip.lockedNow) return { attempts: ip.attempts, lockedNow: true, scope: 'ip', ...extra };
    if (spray.lockedNow)
      return { attempts: spray.attempts, lockedNow: true, scope: 'spray', ...extra };
    return { attempts: ip.attempts, lockedNow: false, ...extra };
  }

  /** Sucesso: zera o bucket daquele par (o agregado do IP segue contando só falhas). */
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

  // ── auxiliares ─────────────────────────────────────────────────────────────

  private sprayKeyOf(key: string): string {
    const ipPart = key.startsWith('login::') ? key.slice('login::'.length) : key;
    const sep = ipPart.indexOf('|');
    return `spray::${sep >= 0 ? ipPart.slice(0, sep) : ipPart}`;
  }

  /** Conta falhas globais só para telemetria; sinaliza uma vez por janela ao cruzar o limiar. */
  private recordGlobalTelemetry(now: number): boolean {
    const b = this.buckets.get(this.GLOBAL_KEY) ?? { fails: [], inFlight: 0 };
    b.fails = b.fails.filter((t) => now - t < this.GLOBAL_WINDOW_MS);
    b.fails.push(now);
    this.buckets.set(this.GLOBAL_KEY, b);
    if (b.fails.length >= this.GLOBAL_ALERT_THRESHOLD && now >= this.globalAlertUntil) {
      this.globalAlertUntil = now + this.GLOBAL_WINDOW_MS;
      return true;
    }
    return false;
  }

  private policyFor(scope: ThrottleScope): Policy {
    return scope === 'spray' ? this.SPRAY_POLICY : this.IP_POLICY;
  }

  private statusFor(
    key: string,
    scope: ThrottleScope,
    includeInFlight: boolean,
    now = Date.now(),
  ): ThrottleStatus {
    const b = this.buckets.get(key);
    if (!b) return { locked: false, retryAfterSec: 0, attempts: 0, scope };
    const policy = this.policyFor(scope);
    if (b.lockedUntil && b.lockedUntil > now) {
      return {
        locked: true,
        retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000),
        attempts: b.fails.length,
        scope,
      };
    }
    const recentFails = b.fails.filter((t) => now - t < policy.windowMs);
    if (recentFails.length === 0 && b.inFlight === 0) {
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
