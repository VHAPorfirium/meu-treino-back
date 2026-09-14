import { Injectable } from '@nestjs/common';
import { TrainerNote } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NoteRepository, NoteWithFrom } from '../domain/note.repository';

const FROM = { from: { select: { id: true, name: true } } };

@Injectable()
export class PrismaNoteRepository implements NoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { fromId: string; toId: string; text: string }): Promise<NoteWithFrom> {
    return this.prisma.trainerNote.create({ data, include: FROM });
  }

  listForUser(toId: string, limit: number): Promise<NoteWithFrom[]> {
    return this.prisma.trainerNote.findMany({
      where: { toId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: FROM,
    });
  }

  listSentTo(toId: string, limit: number): Promise<NoteWithFrom[]> {
    return this.listForUser(toId, limit);
  }

  findById(id: string): Promise<TrainerNote | null> {
    return this.prisma.trainerNote.findUnique({ where: { id } });
  }

  markRead(id: string): Promise<TrainerNote> {
    return this.prisma.trainerNote.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  countUnread(toId: string): Promise<number> {
    return this.prisma.trainerNote.count({ where: { toId, readAt: null } });
  }
}
