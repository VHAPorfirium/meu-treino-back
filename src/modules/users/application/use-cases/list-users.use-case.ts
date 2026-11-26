import { Inject, Injectable } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { CryptoService } from '../../../../shared/security/crypto.service';
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

export function toUserSummary(user: User, crypto: CryptoService): UserSummary {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    cpfMasked: crypto.decryptCpfMasked(user.cpfEncrypted, user.id),
  };
}

/** Lista usuários SEM dados sensíveis (nunca expõe pinHash nem CPF completo). */
@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly crypto: CryptoService,
  ) {}

  async execute(role?: Role, active?: boolean): Promise<UserSummary[]> {
    const all = await this.users.findAll();
    return all
      .filter((u) => (role ? u.role === role : true))
      .filter((u) => (active !== undefined ? u.active === active : true))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((u) => toUserSummary(u, this.crypto));
  }
}
