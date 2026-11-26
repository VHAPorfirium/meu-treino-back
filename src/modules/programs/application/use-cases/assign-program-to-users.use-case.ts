import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProgramStatus, Role } from '@prisma/client';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import {
  USER_REPOSITORY,
  UserRepository,
} from '../../../users/domain/user.repository';
import { PushService } from '../../../push/application/push.service';
import { ProgramDurationPolicy } from '../../domain/program-duration-policy';
import { diaLocal } from '../../../../shared/time/dia-local';

/**
 * Coloca alunos num programa.
 *
 * Regra: cada aluno está em no máximo UM programa por vez. Se ele já estiver em
 * outro (ou tiver concluído uma rodada anterior), a participação anterior é
 * arquivada — preservando o relatório/conquista se ela foi concluída — e os
 * treinos dela saem da lista antes de entrar no novo. Quem já está ATIVO neste
 * mesmo programa é ignorado.
 */
@Injectable()
export class AssignProgramToUsersUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly pushService: PushService,
  ) {}

  async execute(programId: string, userIds: string[]) {
    const program = await this.programRepository.findProgramById(programId);
    if (!program) throw new NotFoundException('Programa não encontrado');

    const uniqueUserIds = Array.from(new Set(userIds));
    await this.ensureAllAreTrainees(uniqueUserIds);

    const newParticipantIds: string[] = [];
    for (const userId of uniqueUserIds) {
      const currentAssignment = await this.programRepository.findCurrentAssignmentByUser(userId);
      if (
        currentAssignment?.programId === programId &&
        currentAssignment.status === ProgramStatus.ACTIVE
      ) {
        continue;
      }
      if (currentAssignment) await this.programRepository.archiveAssignment(currentAssignment.id);
      newParticipantIds.push(userId);
    }

    await this.programRepository.assignProgramToUsers(programId, newParticipantIds, diaLocal());

    if (newParticipantIds.length) {
      const isChallengeWithDeadline = ProgramDurationPolicy.hasDeadline(program.type);
      void this.pushService.notifyUsers(newParticipantIds, {
        title: isChallengeWithDeadline ? 'Nova jornada começando 🏁' : 'Novo programa de treino 💪',
        body: `${program.name} já está no seu app.`,
        url: '/treino',
      });
    }

    return this.programRepository.findProgramById(programId);
  }

  async ensureAllAreTrainees(userIds: string[]) {
    if (userIds.length === 0) return;
    const allUsers = await this.userRepository.findAll();
    const userById = new Map(allUsers.map((user) => [user.id, user]));
    const invalidUserIds = userIds.filter((userId) => userById.get(userId)?.role !== Role.TRAINEE);
    if (invalidUserIds.length) {
      throw new BadRequestException(
        'Só alunos (TRAINEE) existentes podem participar de programas: ' + invalidUserIds.join(', '),
      );
    }
  }
}
