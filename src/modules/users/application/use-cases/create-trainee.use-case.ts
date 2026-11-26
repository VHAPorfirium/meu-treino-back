import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { USER_REPOSITORY, UserRepository } from '../../domain/user.repository';
import { CreateTraineeDto } from '../dto/create-trainee.dto';
import { UserSummary } from './list-users.use-case';

/**
 * Cadastra um aluno pelo painel do personal.
 *
 * O login é só por PIN (o próprio PIN identifica a pessoa), então dois usuários
 * NÃO podem ter o mesmo PIN — por isso ele é comparado com o hash de todos.
 */
@Injectable()
export class CreateTraineeUseCase {
  /** Serializa criações concorrentes para evitar bypass da unicidade de PIN (argon2). */
  private pendingCreation: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  execute(createTraineeDto: CreateTraineeDto): Promise<UserSummary> {
    const run = this.pendingCreation.then(
      () => this.createSerial(createTraineeDto),
      () => this.createSerial(createTraineeDto),
    );
    this.pendingCreation = run.catch(() => undefined);
    return run;
  }

  private async createSerial(createTraineeDto: CreateTraineeDto): Promise<UserSummary> {
    const traineeName = createTraineeDto.name.trim();
    const existingUsers = await this.userRepository.findAll();

    const isNameTaken = existingUsers.some(
      (existingUser) => existingUser.name.toLocaleLowerCase('pt-BR') === traineeName.toLocaleLowerCase('pt-BR'),
    );
    if (isNameTaken) throw new ConflictException('Já existe um usuário com esse nome');

    for (const existingUser of existingUsers) {
      if (await argon2.verify(existingUser.pinHash, createTraineeDto.pin)) {
        throw new ConflictException('Esse PIN já está em uso. Escolha outro.');
      }
    }

    try {
      const createdUser = await this.userRepository.create({
        name: traineeName,
        role: Role.TRAINEE,
        pinHash: await argon2.hash(createTraineeDto.pin),
      });
      return { id: createdUser.id, name: createdUser.name, role: createdUser.role };
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Já existe um usuário com esse nome');
      }
      throw err;
    }
  }
}
