import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  USER_REPOSITORY,
  UserRepository,
} from '../../../users/domain/user.repository';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { validateStrongPassword } from '../../../../shared/security/cpf-and-password';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { UserStatusCacheService } from '../../../../shared/auth/user-status-cache.service';

export interface ChangePasswordContext {
  ip: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly security: SecurityLogger,
    private readonly userStatusCache: UserStatusCacheService,
  ) {}

  async execute(
    userId: string,
    dto: ChangePasswordDto,
    ctx: ChangePasswordContext,
  ): Promise<{ ok: true; mustChangePassword: false }> {
    const user = await this.users.findById(userId);
    if (!user || !user.active) {
      throw new UnauthorizedException('Conta desativada');
    }

    const currentMatches = await argon2
      .verify(user.pinHash, dto.currentPassword)
      .catch(() => false);
    if (!currentMatches) {
      throw new BadRequestException('Senha atual incorreta');
    }

    const strength = validateStrongPassword(dto.newPassword);
    if (!strength.valid) {
      throw new BadRequestException(strength.reason);
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'A nova senha deve ser diferente da senha atual',
      );
    }

    const pinHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.users.update(user.id, {
      pinHash,
      mustChangePassword: false,
    });
    this.userStatusCache.invalidate(user.id);

    this.security.event('auth.password.changed', {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      userId: user.id,
      actorUserId: user.id,
      role: user.role,
      method: 'POST',
      path: '/api/auth/change-password',
      statusCode: 200,
    });

    return { ok: true, mustChangePassword: false };
  }
}
