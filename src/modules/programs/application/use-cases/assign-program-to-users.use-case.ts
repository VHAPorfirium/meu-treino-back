import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  PROGRAM_REPOSITORY,
  ProgramRepository,
} from '../../domain/program.repository';
import {
  USER_REPOSITORY,
  UserRepository,
} from '../../../users/domain/user.repository';
import {
  TrainerAccessService,
  ensureTrainerAccess,
} from '../../../links/application/trainer-access.service';
import { PushService } from '../../../push/application/push.service';
import { ProgramDurationPolicy } from '../../domain/program-duration-policy';
import { diaLocal } from '../../../../shared/time/dia-local';
import {
  assertProgramOwnership,
  filterProgramAssignmentsToActiveTrainees,
} from '../program-ownership';

@Injectable()
export class AssignProgramToUsersUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly programRepository: ProgramRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly pushService: PushService,
    @Optional() private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(programId: string, userIds: string[], trainerId?: string) {
    const program = await this.programRepository.findProgramById(programId);
    if (!program) throw new NotFoundException('Programa não encontrado');
    assertProgramOwnership(program, trainerId);

    const uniqueUserIds = Array.from(new Set(userIds));
    await this.ensureAllAreTrainees(uniqueUserIds, trainerId);

    const newParticipantIds = await this.programRepository.assignProgramToUsers(
      programId,
      uniqueUserIds,
      diaLocal(),
    );

    if (newParticipantIds.length) {
      const isChallengeWithDeadline = ProgramDurationPolicy.hasDeadline(program.type);
      void this.pushService.notifyUsers(newParticipantIds, {
        title: isChallengeWithDeadline ? 'Nova jornada começando 🏁' : 'Novo programa de treino 💪',
        body: `${program.name} já está no seu app.`,
        url: '/treino',
      });
    }

    const updatedProgram = await this.programRepository.findProgramById(programId);
    return filterProgramAssignmentsToActiveTrainees(
      updatedProgram,
      trainerId,
      this.trainerAccess,
    );
  }

  async ensureAllAreTrainees(userIds: string[], trainerId?: string) {
    if (userIds.length === 0) return;
    const foundUsers = await this.userRepository.findRolesByIds(userIds);
    const userById = new Map(foundUsers.map((user) => [user.id, user]));
    const invalidUserIds = userIds.filter(
      (userId) => userById.get(userId)?.role !== Role.TRAINEE,
    );
    if (invalidUserIds.length) {
      throw new BadRequestException(
        'Só alunos (TRAINEE) existentes podem participar de programas: ' +
          invalidUserIds.join(', '),
      );
    }
    if (trainerId && ensureTrainerAccess(this.trainerAccess)) {
      await this.trainerAccess.assertAllActiveLinks(trainerId, userIds);
    }
  }
}
