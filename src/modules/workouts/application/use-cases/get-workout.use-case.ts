import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  WORKOUT_REPOSITORY,
  WorkoutRepository,
} from '../../domain/workout.repository';
import {
  TrainerAccessService,
  ensureTrainerAccess,
} from '../../../links/application/trainer-access.service';
import { assertWorkoutOwnership } from '../workout-ownership';

@Injectable()
export class GetWorkoutUseCase {
  constructor(
    @Inject(WORKOUT_REPOSITORY)
    private readonly repo: WorkoutRepository,
    @Optional() private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(id: string, trainerId?: string) {
    const workout = await this.repo.findByIdWithExercises(id);
    if (!workout) throw new NotFoundException('Treino não encontrado');
    assertWorkoutOwnership(workout, trainerId);
    // expõe `assignees: [{id,name}]` no lugar da tabela de junção crua
    const { assignments, ...rest } = workout;
    let assignees = assignments.map((a) => a.user);
    if (trainerId && ensureTrainerAccess(this.trainerAccess)) {
      // Ex-alunos (vínculo ENDED) não aparecem para o personal.
      const activeSet = new Set(await this.trainerAccess.getActiveTraineeIds(trainerId));
      assignees = assignees.filter((a) => activeSet.has(a.id));
    }
    return { ...rest, assignees };
  }
}
