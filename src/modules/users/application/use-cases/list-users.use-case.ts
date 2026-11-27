import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CryptoService } from '../../../../shared/security/crypto.service';
import { TrainerAccessService } from '../../../links/application/trainer-access.service';
import {
  USER_REPOSITORY,
  UserListRecord,
  UserRepository,
} from '../../domain/user.repository';

export interface UserSummary {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  cpfMasked: string | null;
}

export function toUserSummary(
  user: UserListRecord,
  crypto: CryptoService,
  includeCpf = true,
): UserSummary {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    cpfMasked: includeCpf
      ? crypto.decryptCpfMasked(user.cpfEncrypted, user.id)
      : null,
  };
}

/**
 * Lista usuários respeitando estritamente o papel de quem consulta:
 *  - `ADMIN`: enxerga todos os perfis.
 *  - `RECEPTION`: enxerga apenas `TRAINEE` e `PERSONAL` (nunca `ADMIN`/`RECEPTION`).
 *  - `PERSONAL`: enxerga apenas `TRAINEE` com vínculo `ACTIVE` consigo (sem CPF mascarado).
 */
@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly crypto: CryptoService,
    @Optional() private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(
    role?: Role,
    active?: boolean,
    actor?: { userId: string; role: Role },
  ): Promise<UserSummary[]> {
    const actorRole = actor?.role ?? Role.ADMIN;

    if (
      actorRole === Role.RECEPTION &&
      role !== undefined &&
      role !== Role.TRAINEE &&
      role !== Role.PERSONAL
    ) {
      throw new ForbiddenException(
        'A Portaria só pode consultar alunos e personais',
      );
    }

    if (
      actorRole === Role.PERSONAL &&
      role !== undefined &&
      role !== Role.TRAINEE
    ) {
      throw new ForbiddenException(
        'O personal só pode consultar seus alunos vinculados',
      );
    }

    if (actorRole === Role.PERSONAL && actor) {
      const linkedIds = this.trainerAccess
        ? await this.trainerAccess.getActiveTraineeIds(actor.userId)
        : [];
      const linked = await this.users.findManyForList({
        ids: linkedIds,
        roles: [Role.TRAINEE],
        active,
      });
      return linked
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((u) => toUserSummary(u, this.crypto, false));
    }

    const visibleRoles =
      actorRole === Role.RECEPTION ? [Role.TRAINEE, Role.PERSONAL] : undefined;
    const roles = role ? [role] : visibleRoles;

    const users = await this.users.findManyForList({ roles, active });
    return users
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((u) => toUserSummary(u, this.crypto, true));
  }
}
