import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PushService } from '../../../push/application/push.service';
import { TrainerAccessService } from '../../../links/application/trainer-access.service';
import { UserRepository } from '../../../users/domain/user.repository';
import { NoteRepository } from '../../domain/note.repository';
import {
  CreateNoteUseCase,
  ListMyNotesUseCase,
  ListNotesForUserUseCase,
} from './notes.use-cases';

describe('Notes — isolamento de privacidade por vínculo Personal ↔ Aluno', () => {
  it('Personal B só vê recados do próprio vínculo ACTIVE (nunca recados do Personal A)', async () => {
    const notes = {
      listByTrainerLink: jest.fn().mockResolvedValue([{ id: 'n-b', trainerLinkId: 'link-b' }]),
    } as unknown as jest.Mocked<NoteRepository>;
    const trainerAccess = {
      assertActiveLink: jest.fn().mockResolvedValue({ id: 'link-b' }),
    } as unknown as jest.Mocked<TrainerAccessService>;

    const useCase = new ListNotesForUserUseCase(notes, trainerAccess);
    const result = await useCase.execute('personal-b', 'u-aluna');

    expect(trainerAccess.assertActiveLink).toHaveBeenCalledWith('personal-b', 'u-aluna');
    expect(notes.listByTrainerLink).toHaveBeenCalledWith('u-aluna', 'link-b', 100);
    expect(result).toHaveLength(1);
  });

  it('bloqueia envio de recado quando personal não tem vínculo ACTIVE com o aluno', async () => {
    const notes = { create: jest.fn() } as unknown as NoteRepository;
    const users = {
      findById: jest.fn().mockResolvedValue({ id: 'u-aluna', role: Role.TRAINEE }),
    } as unknown as UserRepository;
    const push = { notifyUsers: jest.fn() } as unknown as PushService;
    const trainerAccess = {
      assertActiveLink: jest.fn().mockRejectedValue(new ForbiddenException('sem vínculo')),
    } as unknown as TrainerAccessService;

    const useCase = new CreateNoteUseCase(notes, users, push, trainerAccess);
    await expect(
      useCase.execute('personal-outro', { toId: 'u-aluna', text: 'Oi' }),
    ).rejects.toThrow(ForbiddenException);
    expect(notes.create).not.toHaveBeenCalled();
  });

  it('sinaliza isCurrentTrainer para o aluno distinguir recados do personal atual e de anteriores', async () => {
    const notes = {
      listForUser: jest.fn().mockResolvedValue([
        { id: 'n2', trainerLinkId: 'link-b', text: 'Novo' },
        { id: 'n1', trainerLinkId: 'link-a', text: 'Antigo' },
      ]),
      countUnread: jest.fn().mockResolvedValue(1),
    } as unknown as NoteRepository;
    const trainerAccess = {
      getActiveLinkForTrainee: jest.fn().mockResolvedValue({ id: 'link-b' }),
    } as unknown as TrainerAccessService;

    const useCase = new ListMyNotesUseCase(notes, trainerAccess);
    const res = await useCase.execute('u-aluna');

    expect(res.unread).toBe(1);
    expect(res.items[0].isCurrentTrainer).toBe(true);
    expect(res.items[1].isCurrentTrainer).toBe(false);
  });
});
