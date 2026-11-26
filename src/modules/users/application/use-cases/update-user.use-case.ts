import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserStatusCacheService } from '../../../../shared/auth/user-status-cache.service';
import { CryptoService } from '../../../../shared/security/crypto.service';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import {
  isValidCpf,
  isValidUsername,
  maskCpf,
  normalizeCpf,
  normalizeUsername,
} from '../../../../shared/security/cpf-and-password';
import {
  UpdateUserInput,
  USER_REPOSITORY,
  UserRepository,
} from '../../domain/user.repository';
import { UpdateUserDto } from '../dto/update-user.dto';
import { AuditActorContext } from '../username-generator';
import { toUserSummary, UserSummary } from './list-users.use-case';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly crypto: CryptoService,
    private readonly userStatusCache: UserStatusCacheService,
    private readonly security: SecurityLogger,
  ) {}

  async execute(
    userId: string,
    dto: UpdateUserDto,
    ctx: AuditActorContext,
  ): Promise<UserSummary> {
    const target = await this.users.findById(userId);
    if (!target) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const patch: UpdateUserInput = {};
    let identifierMasked: string | undefined;

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (trimmed.length < 2 || trimmed.length > 60) {
        throw new BadRequestException('O nome deve ter entre 2 e 60 caracteres');
      }
      if (trimmed !== target.name) {
        patch.name = trimmed;
      }
    }

    if (dto.username !== undefined) {
      const normalized = normalizeUsername(dto.username);
      if (!isValidUsername(normalized)) {
        throw new BadRequestException(
          'Apelido inválido (use 3 a 40 caracteres: letras, números, ponto, hífen ou _)',
        );
      }
      if (normalized !== target.username) {
        const taken = await this.users.findByUsername(normalized);
        if (taken && taken.id !== target.id) {
          throw new ConflictException('Esse apelido já está em uso');
        }
        patch.username = normalized;
      }
    }

    if (dto.cpf !== undefined && dto.cpf.trim() !== '') {
      const digits = normalizeCpf(dto.cpf);
      if (!isValidCpf(digits)) {
        throw new BadRequestException('CPF inválido');
      }
      const cpfHash = this.crypto.hashCpf(digits);
      if (cpfHash !== target.cpfHash) {
        const taken = await this.users.findByCpfHash(cpfHash);
        if (taken && taken.id !== target.id) {
          throw new ConflictException(
            'Já existe uma conta cadastrada com este CPF',
          );
        }
        patch.cpfHash = cpfHash;
        patch.cpfEncrypted = this.crypto.encryptCpf(digits, target.id);
        identifierMasked = maskCpf(digits);
      }
    }

    if (Object.keys(patch).length === 0) {
      return toUserSummary(target, this.crypto);
    }

    try {
      const updated = await this.users.update(target.id, patch);
      this.userStatusCache.invalidate(target.id);

      this.security.event('auth.account.updated', {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        userId: updated.id,
        actorUserId: ctx.actorUserId,
        role: updated.role,
        identifierMasked,
        method: 'PATCH',
        path: `/api/users/${updated.id}`,
        statusCode: 200,
      });

      return toUserSummary(updated, this.crypto);
    } catch (err) {
      const prismaErr = err as { code?: string; meta?: { target?: unknown } };
      if (prismaErr?.code === 'P2002') {
        const targetField = String(prismaErr.meta?.target ?? '');
        if (targetField.includes('cpfHash')) {
          throw new ConflictException(
            'Já existe uma conta cadastrada com este CPF',
          );
        }
        throw new ConflictException('Esse apelido já está em uso');
      }
      throw err;
    }
  }
}
