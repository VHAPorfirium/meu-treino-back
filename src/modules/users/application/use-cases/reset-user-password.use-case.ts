import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { UserStatusCacheService } from '../../../../shared/auth/user-status-cache.service';
import { CryptoService } from '../../../../shared/security/crypto.service';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { validateStrongPassword } from '../../../../shared/security/cpf-and-password';
import { USER_REPOSITORY, UserRepository } from '../../domain/user.repository';
import { ResetUserPasswordDto } from '../dto/reset-user-password.dto';
import { AuditActorContext } from '../username-generator';
import { toUserSummary, UserSummary } from './list-users.use-case';

@Injectable()
export class ResetUserPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly crypto: CryptoService,
    private readonly userStatusCache: UserStatusCacheService,
    private readonly security: SecurityLogger,
  ) {}

  async execute(
    userId: string,
    dto: ResetUserPasswordDto,
    ctx: AuditActorContext,
  ): Promise<{ ok: true; user: UserSummary }> {
    const target = await this.users.findById(userId);
    if (!target) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (
      ctx.actorRole === Role.RECEPTION &&
      (target.role === Role.ADMIN || target.role === Role.RECEPTION)
    ) {
      this.security.event('authz.denied', {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        userId: ctx.actorUserId,
        role: ctx.actorRole,
        method: 'POST',
        path: `/api/users/${target.id}/reset-password`,
        statusCode: 403,
        reason: 'reception_cannot_reset_admin_or_reception',
      });
      throw new ForbiddenException(
        'A Portaria só pode redefinir senhas de alunos e personais',
      );
    }

    const strength = validateStrongPassword(dto.newPassword);
    if (!strength.valid) {
      throw new BadRequestException(strength.reason);
    }

    const pinHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    const updated = await this.users.update(target.id, {
      pinHash,
      mustChangePassword: true,
    });
    this.userStatusCache.invalidate(target.id);

    this.security.event('auth.password.reset', {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      userId: updated.id,
      actorUserId: ctx.actorUserId,
      role: updated.role,
      method: 'POST',
      path: `/api/users/${updated.id}/reset-password`,
      statusCode: 200,
    });

    return { ok: true, user: toUserSummary(updated, this.crypto) };
  }
}
