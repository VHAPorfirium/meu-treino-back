import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../shared/auth/roles.decorator';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { CreateNoteDto } from './application/dto/create-note.dto';
import {
  CreateNoteUseCase,
  ListMyNotesUseCase,
  ListNotesForUserUseCase,
  MarkNoteReadUseCase,
} from './application/use-cases/notes.use-cases';

@Controller('notes')
export class NotesController {
  constructor(
    private readonly createNote: CreateNoteUseCase,
    private readonly listMine: ListMyNotesUseCase,
    private readonly listForUser: ListNotesForUserUseCase,
    private readonly markRead: MarkNoteReadUseCase,
  ) {}

  // POST /api/notes { toId, text }  (PERSONAL) — recado do personal pra aluno vinculado
  @Roles(Role.PERSONAL)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateNoteDto) {
    return this.createNote.execute(user.userId, dto);
  }

  // GET /api/notes/mine  (TRAINEE) — meus recados + não lidos
  @Roles(Role.TRAINEE)
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.listMine.execute(user.userId);
  }

  // GET /api/notes/user/:userId  (PERSONAL) — recados do vínculo ativo atual com o aluno
  @Roles(Role.PERSONAL)
  @Get('user/:userId')
  forUser(@CurrentUser() trainer: AuthUser, @Param('userId') userId: string) {
    return this.listForUser.execute(trainer.userId, userId);
  }

  // PATCH /api/notes/:id/read  (TRAINEE) — marca como lido
  @Roles(Role.TRAINEE)
  @Patch(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.markRead.execute(user.userId, id);
  }
}
