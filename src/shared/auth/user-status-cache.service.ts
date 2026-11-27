import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface UserAuthSnapshot {
  id: string;
  role: Role;
  name: string;
  username: string;
  active: boolean;
  mustChangePassword: boolean;
  tokenVersion: number;
}

interface CacheEntry {
  snapshot: UserAuthSnapshot | null;
  expiresAt: number;
}

const TTL_MS = 30_000;
const MAX_ENTRIES = 5_000;

/**
 * Cache curto (30s) do estado de autenticação do usuário (`active`, `mustChangePassword`,
 * `tokenVersion`, `role`, `name`, `username`) usado pelo `JwtStrategy`.
 *
 * Evita bater no Postgres a cada request autenticado e permite invalidação imediata
 * (`invalidate(userId)`) ao desativar conta, redefinir senha ou alterar cadastro.
 */
@Injectable()
export class UserStatusCacheService {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<UserAuthSnapshot | null> {
    const now = Date.now();
    const cached = this.entries.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.snapshot;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        name: true,
        username: true,
        active: true,
        mustChangePassword: true,
        tokenVersion: true,
      },
    });

    if (this.entries.size >= MAX_ENTRIES) {
      this.prune(now);
      if (this.entries.size >= MAX_ENTRIES) {
        const oldestKey = this.entries.keys().next().value;
        if (oldestKey) this.entries.delete(oldestKey);
      }
    }

    this.entries.set(userId, { snapshot: user, expiresAt: now + TTL_MS });
    return user;
  }

  /** Invalidação imediata: próxima requisição já enxerga desativação ou troca de senha. */
  invalidate(userId: string): void {
    this.entries.delete(userId);
  }

  clear(): void {
    this.entries.clear();
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
