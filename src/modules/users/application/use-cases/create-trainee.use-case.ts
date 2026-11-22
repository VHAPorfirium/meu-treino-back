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
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(createTraineeDto: CreateTraineeDto): Promise<UserSummary> {
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

    const createdUser = await this.userRepository.create({
      name: traineeName,
      role: Role.TRAINEE,
      pinHash: await argon2.hash(createTraineeDto.pin),
    });
    return { id: createdUser.id, name: createdUser.name, role: createdUser.role };
  }
}
