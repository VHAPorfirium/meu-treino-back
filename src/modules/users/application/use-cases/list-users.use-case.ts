import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { CryptoService } from '../../../../shared/security/crypto.service';
import { TrainerAccessService } from '../../../links/application/trainer-access.service';
import { USER_REPOSITORY, UserRepository } from '../../domain/user.repository';

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
  user: User,
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

    const all = await this.users.findAll();

    if (actorRole === Role.PERSONAL && actor) {
      const linkedIds = new Set(
        this.trainerAccess
          ? await this.trainerAccess.getActiveTraineeIds(actor.userId)
          : [],
      );
      return all
        .filter((u) => u.role === Role.TRAINEE && linkedIds.has(u.id))
        .filter((u) => (active !== undefined ? u.active === active : true))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((u) => toUserSummary(u, this.crypto, false));
    }

    return all
      .filter((u) => {
        if (actorRole === Role.RECEPTION) {
          return u.role === Role.TRAINEE || u.role === Role.PERSONAL;
        }
        return true;
      })
      .filter((u) => (role ? u.role === role : true))
      .filter((u) => (active !== undefined ? u.active === active : true))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((u) => toUserSummary(u, this.crypto, true));
  }
}
