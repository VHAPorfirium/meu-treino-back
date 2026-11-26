import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { suggestUsernameFromName } from '../../../shared/security/cpf-and-password';
import {
  CreateUserInput,
  UpdateUserInput,
  UserRepository,
} from '../domain/user.repository';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<User[]> {
    return this.prisma.user.findMany();
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
