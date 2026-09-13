import { User } from '@prisma/client';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  /** Todos os usuários — o login por PIN percorre esta lista e valida o hash. */
  findAll(): Promise<User[]>;
  findById(id: string): Promise<User | null>;
}
