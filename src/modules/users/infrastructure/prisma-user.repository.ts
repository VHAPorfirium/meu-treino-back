import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { suggestUsernameFromName } from '../../../shared/security/cpf-and-password';
import {
  CreateUserInput,
  UpdateUserInput,
  UserListFilter,
  UserListRecord,
  UserRepository,
} from '../domain/user.repository';

const USER_LIST_SELECT = {
  id: true,
  name: true,
  username: true,
  role: true,
  active: true,
  mustChangePassword: true,
  cpfEncrypted: true,
} as const;

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<User[]> {
    return this.prisma.user.findMany();
  }

  findManyForList(filter: UserListFilter): Promise<UserListRecord[]> {
    if (filter.ids && filter.ids.length === 0) return Promise.resolve([]);
    return this.prisma.user.findMany({
      where: {
        ...(filter.ids ? { id: { in: filter.ids } } : {}),
        ...(filter.roles ? { role: { in: filter.roles } } : {}),
        ...(filter.active !== undefined ? { active: filter.active } : {}),
      },
      select: USER_LIST_SELECT,
    });
  }

  findRolesByIds(ids: string[]): Promise<Pick<User, 'id' | 'role'>[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, role: true },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByCpfHash(cpfHash: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { cpfHash } });
  }

  findManyByCpfHash(cpfHash: string): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { cpfHash },
      orderBy: { createdAt: 'asc' },
    });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  create(userData: CreateUserInput): Promise<User> {
    const username = userData.username ?? suggestUsernameFromName(userData.name);
    return this.prisma.user.create({
      data: {
        ...userData,
        username,
      },
    });
  }

  update(id: string, data: UpdateUserInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }
}
