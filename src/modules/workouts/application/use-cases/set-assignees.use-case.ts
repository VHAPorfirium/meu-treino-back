import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import {
  USER_REPOSITORY,
  UserRepository,
} from '../../../users/domain/user.repository';
import { TrainerAccessService } from '../../../links/application/trainer-access.service';
import { SetAssigneesDto } from '../dto/set-assignees.dto';
import { PushService } from '../../../push/application/push.service';
import { assertWorkoutOwnership } from '../workout-ownership';

/**
 * E1.1 — define PRA QUEM o treino é. Valida ownership do treino, que todos são TRAINEE
 * existentes com vínculo ACTIVE com o personal, e avisa por push quem entrou agora.
 */
@Injectable()
export class SetAssigneesUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly workouts: WorkoutRepository,
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    private readonly push: PushService,
    @Optional() private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(workoutId: string, dto: SetAssigneesDto, trainerId?: string) {
    const workout = await this.workouts.findByIdWithExercises(workoutId);
    if (!workout) throw new NotFoundException('Treino não encontrado');
    assertWorkoutOwnership(workout, trainerId);

    const wanted = Array.from(new Set(dto.userIds));
    if (wanted.length) {
      const all = await this.users.findAll();
      const byId = new Map(all.map((u) => [u.id, u]));
      const invalid = wanted.filter(
        (id) => !byId.has(id) || byId.get(id)!.role !== Role.TRAINEE,
      );
      if (invalid.length) {
        throw new BadRequestException(
          'Só alunos (TRAINEE) existentes podem receber treino: ' +
            invalid.join(', '),
        );
      }
      if (trainerId && this.trainerAccess) {
        await this.trainerAccess.assertAllActiveLinks(trainerId, wanted);
      }
    }

    const before = new Set(workout.assignments.map((a) => a.userId));
    const assignees = await this.workouts.setAssignees(workoutId, wanted);

    // notifica só quem foi adicionado agora (best-effort; nunca falha a request)
    const added = wanted.filter((id) => !before.has(id));
    if (added.length) {
      void this.push.notifyUsers(added, {
        title: 'Novo treino pra você 💪',
        body: `${workout.name} foi adicionado à sua lista.`,
        url: '/treino',
      });
    }

    return { assignees };
  }
}
