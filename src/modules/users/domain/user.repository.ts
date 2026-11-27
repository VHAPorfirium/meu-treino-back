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
  tokenVersion?: number | { increment: number };
}

/** Projeção segura (sem `pinHash`, `cpfHash` e `tokenVersion`) para listagens. */
export type UserListRecord = Pick<
  User,
  'id' | 'name' | 'username' | 'role' | 'active' | 'mustChangePassword' | 'cpfEncrypted'
>;

export interface UserListFilter {
  ids?: string[];
  roles?: Role[];
  active?: boolean;
}

export interface UserRepository {
  findAll(): Promise<User[]>;
  /** Filtra no banco e nunca carrega `pinHash` (evita varrer a tabela inteira em RAM). */
  findManyForList(filter: UserListFilter): Promise<UserListRecord[]>;
  /** Apenas `id` + `role` dos IDs informados (validação de destinatários). */
  findRolesByIds(ids: string[]): Promise<Pick<User, 'id' | 'role'>[]>;
  findById(id: string): Promise<User | null>;
  findByCpfHash(cpfHash: string): Promise<User | null>;
  findManyByCpfHash(cpfHash: string): Promise<User[]>;
  findByUsername(username: string): Promise<User | null>;
  create(userData: CreateUserInput): Promise<User>;
  update(id: string, data: UpdateUserInput): Promise<User>;
}
