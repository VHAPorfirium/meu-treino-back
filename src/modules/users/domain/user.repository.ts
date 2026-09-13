import { Role, User } from '@prisma/client';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  findByRole(role: Role): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}
