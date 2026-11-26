import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { NOTE_REPOSITORY, NoteRepository } from '../../domain/note.repository';
import {
  USER_REPOSITORY,
  UserRepository,
} from '../../../users/domain/user.repository';
import { PushService } from '../../../push/application/push.service';
import { TrainerAccessService } from '../../../links/application/trainer-access.service';
import { CreateNoteDto } from '../dto/create-note.dto';

const LIST_LIMIT = 100;

/** PERSONAL → TRAINEE (com vínculo ACTIVE): cria o recado isolado ao vínculo e avisa por push. */
@Injectable()
export class CreateNoteUseCase {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly push: PushService,
    private readonly trainerAccess: TrainerAccessService,
  ) {}

  async execute(fromId: string, dto: CreateNoteDto) {
    const to = await this.users.findById(dto.toId);
    if (!to || to.role !== Role.TRAINEE) {
      throw new BadRequestException(
        'Destinatário precisa ser um aluno (TRAINEE) existente',
      );
    }
    const link = await this.trainerAccess.assertActiveLink(fromId, dto.toId);
    const note = await this.notes.create({
      fromId,
      toId: dto.toId,
      text: dto.text.trim(),
      trainerLinkId: link.id,
    });
    void this.push.notifyUsers([dto.toId], {
      title: 'Recado do seu personal 📝',
      body: note.text.length > 90 ? note.text.slice(0, 87) + '…' : note.text,
      url: '/treino/recados',
    });
    return note;
  }
}

/** TRAINEE: meus recados (sinalizando quais pertencem ao vínculo ACTIVE atual) + não lidos. */
@Injectable()
export class ListMyNotesUseCase {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository,
    @Optional() private readonly trainerAccess?: TrainerAccessService,
  ) {}

  async execute(userId: string) {
    const [items, unread, activeLink] = await Promise.all([
      this.notes.listForUser(userId, LIST_LIMIT),
      this.notes.countUnread(userId),
      this.trainerAccess?.getActiveLinkForTrainee(userId) ?? Promise.resolve(null),
    ]);
    return {
      items: items.map((note) => ({
        ...note,
        isCurrentTrainer: Boolean(activeLink && note.trainerLinkId === activeLink.id),
      })),
      unread,
    };
  }
}

/** PERSONAL: recados enviados a um aluno específico SOMENTE no vínculo ACTIVE atual. */
@Injectable()
export class ListNotesForUserUseCase {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository,
    private readonly trainerAccess: TrainerAccessService,
  ) {}

  async execute(trainerId: string, toId: string) {
    const link = await this.trainerAccess.assertActiveLink(trainerId, toId);
    return this.notes.listByTrainerLink(toId, link.id, LIST_LIMIT);
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
