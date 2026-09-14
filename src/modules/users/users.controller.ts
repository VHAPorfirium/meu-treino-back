import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../shared/auth/roles.decorator';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';

@Controller('users')
export class UsersController {
  constructor(private readonly listUsers: ListUsersUseCase) {}

  // GET /api/users?role=TRAINEE  (ADMIN) — alimenta o select "pra quem é o treino"
  @Roles(Role.ADMIN)
  @Get()
  list(@Query('role') role?: string) {
    if (role !== undefined && !(role in Role)) {
      throw new BadRequestException('role inválido');
    }
    return this.listUsers.execute(role as Role | undefined);
  }
}
