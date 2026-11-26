import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './domain/user.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { UsersController } from './users.controller';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { CreateTraineeUseCase } from './application/use-cases/create-trainee.use-case';
import { SuggestUsernameUseCase } from './application/use-cases/suggest-username.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { SetUserActiveUseCase } from './application/use-cases/set-user-active.use-case';
import { ResetUserPasswordUseCase } from './application/use-cases/reset-user-password.use-case';

@Module({
  controllers: [UsersController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    ListUsersUseCase,
    CreateTraineeUseCase,
    SuggestUsernameUseCase,
    UpdateUserUseCase,
    SetUserActiveUseCase,
    ResetUserPasswordUseCase,
  ],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
