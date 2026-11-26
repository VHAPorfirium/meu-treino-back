import { ConflictException } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { suggestUsernameFromName } from '../../../shared/security/cpf-and-password';
import { UserRepository } from '../domain/user.repository';

export interface AuditActorContext {
  actorUserId: string;
  actorRole?: Role;
  ip: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Valida a política de compartilhamento de CPF entre perfis:
 *  - Nunca permite dois cadastros do MESMO papel com o mesmo CPF.
 *  - `ADMIN` é exclusivo: não pode compartilhar CPF com nenhum outro papel (nem vice-versa).
 *  - `PERSONAL` + `TRAINEE` (e `RECEPTION` + `TRAINEE`) com o mesmo CPF são PERMITIDOS!
 */
export function assertCpfRoleAllowed(
  existingWithSameCpf: User[],
  targetRole: Role,
  excludeUserId?: string,
): void {
  const others = existingWithSameCpf.filter((u) => u.id !== excludeUserId);
  if (others.length === 0) return;

  if (others.some((u) => u.role === targetRole)) {
    throw new ConflictException(
      'Já existe uma conta deste perfil cadastrada com este CPF',
    );
  }

  if (
    targetRole === Role.ADMIN ||
    others.some((u) => u.role === Role.ADMIN)
  ) {
    throw new ConflictException(
      'O CPF de um administrador é exclusivo e não pode ser compartilhado com outros perfis',
    );
  }
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
