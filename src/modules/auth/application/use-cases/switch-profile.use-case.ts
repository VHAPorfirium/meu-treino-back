import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { JwtPayload } from '../../../../shared/auth/jwt-payload';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { USER_REPOSITORY, UserRepository } from '../../../users/domain/user.repository';
import type { LoginContext, ProfileChoice } from './login.use-case';

export interface SwitchProfileResult {
  token: string;
  user: {
    id: string;
    name: string;
    username: string;
    role: Role;
    mustChangePassword: boolean;
  };
}

/**
 * Permite que uma pessoa que possui perfil duplo com o MESMO CPF (ex.: `PERSONAL` + `TRAINEE`)
 * consulte seus perfis irmãos ativos e alterne de modo sem precisar sair e redigitar senha.
 *
 * Isolamento estrito: contas `ADMIN` NUNCA participam de troca de perfil (nem origem, nem destino).
 */
@Injectable()
export class SwitchProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly jwt: JwtService,
    private readonly security: SecurityLogger,
  ) {}

  async listLinkedProfiles(currentUserId: string): Promise<ProfileChoice[]> {
    const current = await this.users.findById(currentUserId);
    if (!current || !current.active || !current.cpfHash || current.role === Role.ADMIN) {
      return [];
    }

    const siblings = await this.users.findManyByCpfHash(current.cpfHash);
    return siblings
      .filter((u) => u.id !== current.id && u.active && u.role !== Role.ADMIN)
      .map((u) => ({ role: u.role, name: u.name, username: u.username }));
  }

  async execute(
    currentUserId: string,
    targetRole: Role,
    ctx: LoginContext,
  ): Promise<SwitchProfileResult> {
    if (targetRole === Role.ADMIN) {
      throw new ForbiddenException('Não é permitido alternar para perfil ADMIN');
    }

    const current = await this.users.findById(currentUserId);
    if (!current || !current.active) {
      throw new UnauthorizedException('Conta inválida ou desativada');
    }
    if (current.role === Role.ADMIN) {
      throw new ForbiddenException('Conta ADMIN não pode alternar para outros perfis');
    }
    if (!current.cpfHash) {
      throw new NotFoundException('Cadastre seu CPF para vincular múltiplos perfis');
    }

    const siblings = await this.users.findManyByCpfHash(current.cpfHash);
    const target = siblings.find(
      (u) => u.id !== current.id && u.role === targetRole && u.active,
    );
    if (!target) {
      throw new NotFoundException('Perfil vinculado não encontrado ou desativado');
    }

    const payload: JwtPayload = {
      sub: target.id,
      role: target.role,
      name: target.name,
      username: target.username,
    };
    const token = await this.jwt.signAsync(payload);

    this.security.event('auth.profile.switched', {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      userId: target.id,
      actorUserId: current.id,
      role: target.role,
      method: 'POST',
      path: '/api/auth/switch-profile',
      statusCode: 200,
    });

    return {
      token,
      user: {
        id: target.id,
        name: target.name,
        username: target.username,
        role: target.role,
        mustChangePassword: target.mustChangePassword,
      },
    };
  }
}
