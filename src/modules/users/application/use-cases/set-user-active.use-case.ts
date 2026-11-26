import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { LinkEndReason, Role } from '@prisma/client';
import { UserStatusCacheService } from '../../../../shared/auth/user-status-cache.service';
import { CacheService } from '../../../../shared/cache/cache.service';
import { CryptoService } from '../../../../shared/security/crypto.service';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import { TrainerAccessService } from '../../../links/application/trainer-access.service';
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
    @Optional() private readonly trainerAccess?: TrainerAccessService,
    @Optional() private readonly cache?: CacheService,
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

    // Trava estrita de anti-escalonamento para a Portaria (RECEPTION):
    // - Nunca altera ADMIN nem outro RECEPTION.
    // - Pode desativar TRAINEE e PERSONAL, e reativar TRAINEE — apenas ADMIN reativa PERSONAL.
    if (ctx.actorRole === Role.RECEPTION) {
      if (target.role === Role.ADMIN || target.role === Role.RECEPTION) {
        this.security.event('authz.denied', {
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
          userId: ctx.actorUserId,
          role: ctx.actorRole,
          method: 'PATCH',
          path: `/api/users/${target.id}/status`,
          statusCode: 403,
          reason: 'reception_cannot_modify_admin_or_reception',
        });
        throw new ForbiddenException(
          'A Portaria não pode alterar contas administrativas ou de portaria',
        );
      }
      if (target.role === Role.PERSONAL && dto.active) {
        this.security.event('authz.denied', {
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
          userId: ctx.actorUserId,
          role: ctx.actorRole,
          method: 'PATCH',
          path: `/api/users/${target.id}/status`,
          statusCode: 403,
          reason: 'reception_cannot_reactivate_personal',
        });
        throw new ForbiddenException(
          'Apenas o administrador pode reativar contas de personal',
        );
      }
    }

    const updated = await this.users.update(target.id, { active: dto.active });
    this.userStatusCache.invalidate(target.id);

    // Ao desligar um PERSONAL, encerra automaticamente todos os seus vínculos ACTIVE e PENDING
    // preservando integralmente treinos, programas e histórico dos alunos.
    if (target.role === Role.PERSONAL && !dto.active) {
      await this.trainerAccess?.endAllLinksForTrainer(
        target.id,
        LinkEndReason.TRAINER_DEACTIVATED,
      );
      await this.cache?.invalidarUsuario('all');
    }

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
