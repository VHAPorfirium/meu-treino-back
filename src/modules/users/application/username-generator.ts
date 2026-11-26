import { randomBytes } from 'node:crypto';
import { suggestUsernameFromName } from '../../../shared/security/cpf-and-password';
import { UserRepository } from '../domain/user.repository';

export interface AuditActorContext {
  actorUserId: string;
  ip: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Resolve um `username` único (`primeiro.ultimo`, `primeiro.ultimo2`, ...) consultando
 * o repositório. Permite excluir o próprio `excludeUserId` em edições de perfil.
 */
export async function resolveUniqueUsername(
  users: UserRepository,
  fullName: string,
  excludeUserId?: string,
): Promise<string> {
  const base = suggestUsernameFromName(fullName);
  const firstCandidate = await users.findByUsername(base);
  if (!firstCandidate || firstCandidate.id === excludeUserId) {
    return base;
  }

  for (let suffix = 2; suffix <= 99; suffix++) {
    const candidate = `${base.slice(0, 38 - String(suffix).length)}${suffix}`;
    const found = await users.findByUsername(candidate);
    if (!found || found.id === excludeUserId) {
      return candidate;
    }
  }

  return `${base.slice(0, 35)}${randomBytes(2).toString('hex')}`;
}
