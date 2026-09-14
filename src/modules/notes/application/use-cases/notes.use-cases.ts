import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { NOTE_REPOSITORY, NoteRepository } from '../../domain/note.repository';
import {
  USER_REPOSITORY,
  UserRepository,
} from '../../../users/domain/user.repository';
import { PushService } from '../../../push/application/push.service';
import { CreateNoteDto } from '../dto/create-note.dto';

const LIST_LIMIT = 100;

/** ADMIN → TRAINEE: cria o recado e avisa por push (best-effort). */
@Injectable()
export class CreateNoteUseCase {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly push: PushService,
  ) {}

  async execute(fromId: string, dto: CreateNoteDto) {
    const to = await this.users.findById(dto.toId);
    if (!to || to.role !== Role.TRAINEE) {
      throw new BadRequestException('Destinatário precisa ser um aluno (TRAINEE) existente');
    }
    const note = await this.notes.create({ fromId, toId: dto.toId, text: dto.text.trim() });
    void this.push.notifyUsers([dto.toId], {
      title: 'Recado do seu personal 📝',
      body: note.text.length > 90 ? note.text.slice(0, 87) + '…' : note.text,
      url: '/treino/recados',
    });
    return note;
  }
}

/** TRAINEE: meus recados (mais recentes primeiro) + contagem de não lidos. */
@Injectable()
export class ListMyNotesUseCase {
  constructor(@Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository) {}

  async execute(userId: string) {
    const [items, unread] = await Promise.all([
      this.notes.listForUser(userId, LIST_LIMIT),
      this.notes.countUnread(userId),
    ]);
    return { items, unread };
  }
}

/** ADMIN: recados enviados a um aluno específico. */
@Injectable()
export class ListNotesForUserUseCase {
  constructor(@Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository) {}

  execute(toId: string) {
    return this.notes.listSentTo(toId, LIST_LIMIT);
  }
}

/** TRAINEE: marca como lido (só o próprio destinatário). Idempotente. */
@Injectable()
export class MarkNoteReadUseCase {
  constructor(@Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository) {}

  async execute(userId: string, noteId: string) {
    const note = await this.notes.findById(noteId);
    if (!note) throw new NotFoundException('Recado não encontrado');
    if (note.toId !== userId) throw new ForbiddenException('Recado de outro usuário');
    if (note.readAt) return note;
    return this.notes.markRead(noteId);
  }
}
