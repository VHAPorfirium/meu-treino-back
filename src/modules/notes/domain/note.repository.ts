import { TrainerNote } from '@prisma/client';

export const NOTE_REPOSITORY = Symbol('NOTE_REPOSITORY');

export type NoteWithFrom = TrainerNote & { from: { id: string; name: string } };

export interface NoteRepository {
  create(data: { fromId: string; toId: string; text: string }): Promise<NoteWithFrom>;
  listForUser(toId: string, limit: number): Promise<NoteWithFrom[]>;
  listSentTo(toId: string, limit: number): Promise<NoteWithFrom[]>;
  findById(id: string): Promise<TrainerNote | null>;
  markRead(id: string): Promise<TrainerNote>;
  countUnread(toId: string): Promise<number>;
}
