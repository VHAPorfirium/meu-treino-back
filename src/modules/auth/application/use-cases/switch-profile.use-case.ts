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

const SWITCHABLE_ROLES: ReadonlySet<Role> = new Set([
  Role.PERSONAL,
  Role.TRAINEE,
]);

/**
 * Permite que uma pessoa que possui perfil duplo com o MESMO CPF (`PERSONAL` ↔ `TRAINEE`)
 * consulte seu perfil irmão ativo e alterne de modo sem precisar sair.
 *
 * Isolamento estrito de segurança:
 *  - Contas `ADMIN` e `RECEPTION` NUNCA participam de troca de perfil (nem origem, nem destino).
 *  - Contas com troca obrigatória de senha pendente (`mustChangePassword = true`) não podem alternar.
 *  - Apenas `ADMIN` consegue vincular um mesmo CPF a um segundo papel (evitando escalonamento pela Portaria).
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
    if (
      !current ||
      !current.active ||
      !current.cpfHash ||
      current.mustChangePassword ||
      !SWITCHABLE_ROLES.has(current.role)
    ) {
      return [];
    }

    const siblings = await this.users.findManyByCpfHash(current.cpfHash);
    return siblings
      .filter(
        (u) =>
          u.id !== current.id &&
          u.active &&
          SWITCHABLE_ROLES.has(u.role),
      )
      .map((u) => ({ role: u.role, name: u.name, username: u.username }));
  }

  async execute(
    currentUserId: string,
    targetRole: Role,
    ctx: LoginContext,
  ): Promise<SwitchProfileResult> {
    if (!SWITCHABLE_ROLES.has(targetRole)) {
      throw new ForbiddenException(
        'Troca rápida de perfil permitida apenas entre Personal e Aluno',
      );
    }

    const current = await this.users.findById(currentUserId);
    if (!current || !current.active) {
      throw new UnauthorizedException('Conta inválida ou desativada');
    }
    if (!SWITCHABLE_ROLES.has(current.role)) {
      throw new ForbiddenException(
        'Este perfil não pode alternar para outras contas',
      );
    }
    if (current.mustChangePassword) {
      throw new ForbiddenException(
        'Conclua a troca de senha obrigatória antes de alternar de perfil',
      );
    }
    if (!current.cpfHash) {
      throw new NotFoundException('Cadastre seu CPF para vincular múltiplos perfis');
    }

    const siblings = await this.users.findManyByCpfHash(current.cpfHash);
    const target = siblings.find(
      (u) =>
        u.id !== current.id &&
        u.role === targetRole &&
        u.active &&
        SWITCHABLE_ROLES.has(u.role),
    );
    if (!target) {
      throw new NotFoundException('Perfil vinculado não encontrado ou desativado');
    }

    const payload: JwtPayload = {
      sub: target.id,
      role: target.role,
      name: target.name,
      username: target.username,
      tv: target.tokenVersion ?? 0,
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
