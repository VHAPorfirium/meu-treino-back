import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../shared/auth/roles.decorator';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { CreateTraineeUseCase } from './application/use-cases/create-trainee.use-case';
import { CreateTraineeDto } from './application/dto/create-trainee.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly listUsers: ListUsersUseCase,
    private readonly createTrainee: CreateTraineeUseCase,
  ) {}

  // GET /api/users?role=TRAINEE  (ADMIN) — alimenta o select "pra quem é o treino"
  @Roles(Role.ADMIN)
  @Get()
  list(@Query('role') role?: string) {
    if (role !== undefined && !Object.values(Role).includes(role as Role)) {
      throw new BadRequestException('role inválido');
    }
    return this.listUsers.execute(role as Role | undefined);
  }

  // POST /api/users { name, pin }  (ADMIN) — cadastra um aluno
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() createTraineeDto: CreateTraineeDto) {
    return this.createTrainee.execute(createTraineeDto);
  }
}
