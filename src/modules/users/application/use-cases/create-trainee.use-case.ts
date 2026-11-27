import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { CryptoService } from '../../../../shared/security/crypto.service';
import { SecurityLogger } from '../../../../shared/security/security-logger';
import {
  isValidCpf,
  isValidUsername,
  maskCpf,
  normalizeCpf,
  normalizeUsername,
  validateStrongPassword,
} from '../../../../shared/security/cpf-and-password';
import { USER_REPOSITORY, UserRepository } from '../../domain/user.repository';
import { CreateTraineeDto } from '../dto/create-trainee.dto';
import {
  assertCpfRoleAllowed,
  AuditActorContext,
  resolveUniqueUsername,
} from '../username-generator';
import { toUserSummary, UserSummary } from './list-users.use-case';

/**
 * Cadastra usuário com CPF criptografado (`cpfHash` + `cpfEncrypted` com AAD=userId),
 * senha forte (`argon2id`) e apelido único (`username`).
 *
 * Regras de RBAC e CPF:
 *  - `RECEPTION` só pode cadastrar `TRAINEE` (nasce sem personal).
 *  - `ADMIN` pode cadastrar `TRAINEE`, `PERSONAL`, `RECEPTION` e `ADMIN`.
 *  - Permite que uma mesma pessoa possua cadastro `PERSONAL` e `TRAINEE` com o MESMO CPF
 *    (enquanto `ADMIN` exige CPF exclusivo).
 */
@Injectable()
export class CreateTraineeUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly crypto: CryptoService,
    private readonly security: SecurityLogger,
  ) {}

  async execute(
    dto: CreateTraineeDto,
    ctx?: AuditActorContext,
  ): Promise<UserSummary> {
    const targetRole = dto.role ?? Role.TRAINEE;

    if (ctx?.actorRole === Role.RECEPTION && targetRole !== Role.TRAINEE) {
      this.security.event('authz.denied', {
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        userId: ctx.actorUserId,
        role: ctx.actorRole,
        method: 'POST',
        path: '/api/users',
        statusCode: 403,
        reason: 'reception_cannot_create_non_trainee',
      });
      throw new ForbiddenException(
        'A Portaria só pode cadastrar contas de alunos (TRAINEE)',
      );
    }

    const userName = dto.name.trim();
    const cpfDigits = normalizeCpf(dto.cpf);
    if (!isValidCpf(cpfDigits)) {
      throw new BadRequestException('CPF inválido');
    }

    const strength = validateStrongPassword(dto.password);
    if (!strength.valid) {
      throw new BadRequestException(strength.reason);
    }

    const cpfHash = this.crypto.hashCpf(cpfDigits);
    const existingSameCpf = await this.userRepository.findManyByCpfHash(cpfHash);
    assertCpfRoleAllowed(existingSameCpf, targetRole, undefined, ctx?.actorRole);

    let username: string;
    if (dto.username && dto.username.trim()) {
      username = normalizeUsername(dto.username);
      if (!isValidUsername(username)) {
        throw new BadRequestException(
          'Apelido inválido (use 3 a 40 caracteres: letras, números, ponto, hífen ou _)',
        );
      }
      const existingByUsername =
        await this.userRepository.findByUsername(username);
      if (existingByUsername) {
        throw new ConflictException('Esse apelido já está em uso');
      }
    } else {
      username = await resolveUniqueUsername(this.userRepository, userName);
    }

    // Gera ID antecipadamente para vincular o AAD (`user:cpf:<userId>`) em 1 única query atômica.
    const userId = `u_${randomBytes(12).toString('hex')}`;
    const cpfEncrypted = this.crypto.encryptCpf(cpfDigits, userId);
    const pinHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    try {
      const createdUser = await this.userRepository.create({
        id: userId,
        name: userName,
        username,
        cpfHash,
        cpfEncrypted,
        role: targetRole,
        pinHash,
        active: true,
        mustChangePassword: true,
      });

      this.security.event('auth.account.created', {
        ip: ctx?.ip ?? 'unknown',
        userAgent: ctx?.userAgent,
        requestId: ctx?.requestId,
        userId: createdUser.id,
        actorUserId: ctx?.actorUserId,
        role: createdUser.role,
        identifierMasked: maskCpf(cpfDigits),
        method: 'POST',
        path: '/api/users',
        statusCode: 201,
      });

      return toUserSummary(createdUser, this.crypto);
    } catch (err) {
      const prismaErr = err as { code?: string; meta?: { target?: unknown } };
      if (prismaErr?.code === 'P2002') {
        const target = String(prismaErr.meta?.target ?? '');
        if (target.includes('cpfHash')) {
          throw new ConflictException(
            'Já existe uma conta deste perfil cadastrada com este CPF',
          );
        }
        throw new ConflictException('Esse apelido já está em uso');
      }
      throw err;
    }
  }
}
