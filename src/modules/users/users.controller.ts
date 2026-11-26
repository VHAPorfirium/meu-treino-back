import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { Roles } from '../../shared/auth/roles.decorator';
import { clientIp, requestId, userAgent } from '../../shared/http/client-ip';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { CreateTraineeUseCase } from './application/use-cases/create-trainee.use-case';
import { SuggestUsernameUseCase } from './application/use-cases/suggest-username.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { SetUserActiveUseCase } from './application/use-cases/set-user-active.use-case';
import { ResetUserPasswordUseCase } from './application/use-cases/reset-user-password.use-case';
import { CreateTraineeDto } from './application/dto/create-trainee.dto';
import { UpdateUserDto } from './application/dto/update-user.dto';
import { SetUserActiveDto } from './application/dto/set-user-active.dto';
import { ResetUserPasswordDto } from './application/dto/reset-user-password.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly listUsers: ListUsersUseCase,
    private readonly createTrainee: CreateTraineeUseCase,
    private readonly suggestUsernameUseCase: SuggestUsernameUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly setUserActiveUseCase: SetUserActiveUseCase,
    private readonly resetUserPasswordUseCase: ResetUserPasswordUseCase,
  ) {}

  // GET /api/users?role=TRAINEE&active=true  (ADMIN)
  @Roles(Role.ADMIN)
  @Get()
  list(@Query('role') role?: string, @Query('active') active?: string) {
    if (role !== undefined && !Object.values(Role).includes(role as Role)) {
      throw new BadRequestException('role inválido');
    }
    let activeFilter: boolean | undefined;
    if (active !== undefined) {
      if (active === 'true') activeFilter = true;
      else if (active === 'false') activeFilter = false;
      else throw new BadRequestException('active inválido');
    }
    return this.listUsers.execute(role as Role | undefined, activeFilter);
  }

  // GET /api/users/suggest-username?name=Gabriel+Silva  (ADMIN)
  @Roles(Role.ADMIN)
  @Get('suggest-username')
  suggestUsername(@Query('name') name: string) {
    return this.suggestUsernameUseCase.execute(name);
  }

  // POST /api/users { name, cpf, password, username? }  (ADMIN)
  @Roles(Role.ADMIN)
  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @Body() createTraineeDto: CreateTraineeDto,
    @Req() req: Request,
  ) {
    return this.createTrainee.execute(createTraineeDto, {
      actorUserId: actor.userId,
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: requestId(req),
    });
  }

  // PATCH /api/users/:id { name?, username?, cpf? }  (ADMIN)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ) {
    return this.updateUserUseCase.execute(id, dto, {
      actorUserId: actor.userId,
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: requestId(req),
    });
  }

  // PATCH /api/users/:id/status { active }  (ADMIN)
  @Roles(Role.ADMIN)
  @Patch(':id/status')
  setStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetUserActiveDto,
    @Req() req: Request,
  ) {
    return this.setUserActiveUseCase.execute(id, dto, {
      actorUserId: actor.userId,
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: requestId(req),
    });
  }

  // POST /api/users/:id/reset-password { newPassword }  (ADMIN)
  @Roles(Role.ADMIN)
  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
    @Req() req: Request,
  ) {
    return this.resetUserPasswordUseCase.execute(id, dto, {
      actorUserId: actor.userId,
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: requestId(req),
    });
  }
}
