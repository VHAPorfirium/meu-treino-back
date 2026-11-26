import { Role, User } from '@prisma/client';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface CreateUserInput {
  id?: string;
  name: string;
  username?: string;
  cpfHash?: string | null;
  cpfEncrypted?: string | null;
  role: Role;
  pinHash: string;
  active?: boolean;
  mustChangePassword?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  username?: string;
  cpfHash?: string | null;
  cpfEncrypted?: string | null;
  pinHash?: string;
  active?: boolean;
  mustChangePassword?: boolean;
}

export interface UserRepository {
  findAll(): Promise<User[]>;
  findById(id: string): Promise<User | null>;
  findByCpfHash(cpfHash: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  create(userData: CreateUserInput): Promise<User>;
  update(id: string, data: UpdateUserInput): Promise<User>;
}
