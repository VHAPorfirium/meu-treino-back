import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NOTE_REPOSITORY } from './domain/note.repository';
import { PrismaNoteRepository } from './infrastructure/prisma-note.repository';
import { UsersModule } from '../users/users.module';
import { PushModule } from '../push/push.module';
import {
  CreateNoteUseCase,
  ListMyNotesUseCase,
  ListNotesForUserUseCase,
  MarkNoteReadUseCase,
} from './application/use-cases/notes.use-cases';

@Module({
  imports: [UsersModule, PushModule],
  controllers: [NotesController],
  providers: [
    { provide: NOTE_REPOSITORY, useClass: PrismaNoteRepository },
    CreateNoteUseCase,
    ListMyNotesUseCase,
    ListNotesForUserUseCase,
    MarkNoteReadUseCase,
  ],
})
export class NotesModule {}
