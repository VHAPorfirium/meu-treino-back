import { ForbiddenException, Injectable } from '@nestjs/common';
import { LinkEndReason, LinkStatus, TrainerTraineeLink } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

/**
 * Serviço central de autorização multi-tenant Personal ↔ Aluno.
 *
 * Usado por todos os módulos de domínio (workouts, programs, workout-logs, notes,
 * progress-photos, users) para garantir que um `PERSONAL` só enxergue e manipule
 * alunos com vínculo `ACTIVE` consigo mesmo.
 */
@Injectable()
export class TrainerAccessService {
  constructor(private readonly prisma: PrismaService) {}

  getActiveLink(
    trainerId: string,
    traineeId: string,
  ): Promise<TrainerTraineeLink | null> {
    return this.prisma.trainerTraineeLink.findFirst({
      where: { trainerId, traineeId, status: LinkStatus.ACTIVE },
    });
  }

  async assertActiveLink(
    trainerId: string,
    traineeId: string,
  ): Promise<TrainerTraineeLink> {
    const link = await this.getActiveLink(trainerId, traineeId);
    if (!link) {
      throw new ForbiddenException(
        'Você não possui vínculo ativo com este aluno',
      );
    }
    return link;
  }

  async assertAllActiveLinks(
    trainerId: string,
    traineeIds: string[],
  ): Promise<void> {
    const unique = Array.from(new Set(traineeIds));
    if (unique.length === 0) return;

    const links = await this.prisma.trainerTraineeLink.findMany({
      where: {
        trainerId,
        traineeId: { in: unique },
        status: LinkStatus.ACTIVE,
      },
      select: { traineeId: true },
    });

    if (links.length !== unique.length) {
      throw new ForbiddenException(
        'Só é possível direcionar treinos ou programas para alunos com vínculo ativo',
      );
    }
  }

  async getActiveTraineeIds(trainerId: string): Promise<string[]> {
    const links = await this.prisma.trainerTraineeLink.findMany({
      where: { trainerId, status: LinkStatus.ACTIVE },
      select: { traineeId: true },
    });
    return links.map((l) => l.traineeId);
  }

  getActiveLinkForTrainee(traineeId: string): Promise<TrainerTraineeLink | null> {
    return this.prisma.trainerTraineeLink.findFirst({
      where: { traineeId, status: LinkStatus.ACTIVE },
    });
  }

  /**
   * Encerra todos os vínculos `ACTIVE` e `PENDING` de um personal (ex.: ao ser desligado).
   * Não apaga treinos, programas, histórico nem fotos dos alunos.
   */
  async endAllLinksForTrainer(
    trainerId: string,
    reason: LinkEndReason,
  ): Promise<number> {
    const { count } = await this.prisma.trainerTraineeLink.updateMany({
      where: {
        trainerId,
        status: { in: [LinkStatus.ACTIVE, LinkStatus.PENDING] },
      },
      data: {
        status: LinkStatus.ENDED,
        endedReason: reason,
        endedAt: new Date(),
      },
    });
    return count;
  }
}
