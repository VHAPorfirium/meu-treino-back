import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { USER_REPOSITORY, UserRepository } from '../../domain/user.repository';

export interface UserSummary {
  id: string;
  name: string;
  role: Role;
}

/** Lista usuários SEM dados sensíveis (nunca expõe pinHash). Filtro opcional por papel. */
@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
  ) {}

  async execute(role?: Role): Promise<UserSummary[]> {
    const all = await this.users.findAll();
    return all
      .filter((u) => (role ? u.role === role : true))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => ({ id: u.id, name: u.name, role: u.role }));
  }
}
