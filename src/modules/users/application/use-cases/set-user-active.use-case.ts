import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserStatusCacheService } from '../../../../shared/auth/user-status-cache.service';
import { CryptoService } from '../../../../shared/security/crypto.service';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { USER_REPOSITORY, UserRepository } from '../../domain/user.repository';
import { SetUserActiveDto } from '../dto/set-user-active.dto';
import { AuditActorContext } from '../username-generator';
import { toUserSummary, UserSummary } from './list-users.use-case';

@Injectable()
export class SetUserActiveUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly crypto: CryptoService,
    private readonly userStatusCache: UserStatusCacheService,
    private readonly security: SecurityLogger,
  ) {}

  async execute(
    userId: string,
    dto: SetUserActiveDto,
    ctx: AuditActorContext,
  ): Promise<UserSummary> {
    const target = await this.users.findById(userId);
    if (!target) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!dto.active && target.id === ctx.actorUserId) {
      throw new BadRequestException('Você não pode desativar a própria conta');
    }

    const updated = await this.users.update(target.id, { active: dto.active });
    this.userStatusCache.invalidate(target.id);

    this.security.event(
      dto.active ? 'auth.account.reactivated' : 'auth.account.deactivated',
      {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        userId: updated.id,
        actorUserId: ctx.actorUserId,
        role: updated.role,
        method: 'PATCH',
        path: `/api/users/${updated.id}/status`,
        statusCode: 200,
      },
    );

    return toUserSummary(updated, this.crypto);
  }
}
