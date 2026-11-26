import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY, UserRepository } from '../../domain/user.repository';
import { resolveUniqueUsername } from '../username-generator';

@Injectable()
export class SuggestUsernameUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
  ) {}

  async execute(name: string): Promise<{ username: string }> {
    const trimmed = name?.trim();
    if (!trimmed || trimmed.length < 2) {
      throw new BadRequestException('Informe um nome válido para sugerir o apelido');
    }
    const username = await resolveUniqueUsername(this.users, trimmed);
    return { username };
  }
}
