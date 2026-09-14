import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './domain/user.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { UsersController } from './users.controller';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';

@Module({
  controllers: [UsersController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    ListUsersUseCase,
  ],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
