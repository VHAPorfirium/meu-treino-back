import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../shared/auth/roles.decorator';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { CreateProgramDto } from './application/dto/create-program.dto';
import { UpdateProgramDto } from './application/dto/update-program.dto';
import { AssignProgramDto } from './application/dto/assign-program.dto';
import { CreateProgramUseCase } from './application/use-cases/create-program.use-case';
import { UpdateProgramUseCase } from './application/use-cases/update-program.use-case';
import { DeleteProgramUseCase } from './application/use-cases/delete-program.use-case';
import { ListProgramsUseCase } from './application/use-cases/list-programs.use-case';
import { GetProgramUseCase } from './application/use-cases/get-program.use-case';
import { AssignProgramToUsersUseCase } from './application/use-cases/assign-program-to-users.use-case';
import { ArchiveProgramAssignmentUseCase } from './application/use-cases/archive-program-assignment.use-case';
import { GetCurrentProgramUseCase } from './application/use-cases/get-current-program.use-case';
import { ListMyAchievementsUseCase } from './application/use-cases/list-my-achievements.use-case';

@Controller('programs')
export class ProgramsController {
  constructor(
    private readonly createProgram: CreateProgramUseCase,
    private readonly updateProgram: UpdateProgramUseCase,
    private readonly deleteProgram: DeleteProgramUseCase,
    private readonly listPrograms: ListProgramsUseCase,
    private readonly getProgram: GetProgramUseCase,
    private readonly assignProgramToUsers: AssignProgramToUsersUseCase,
    private readonly archiveProgramAssignment: ArchiveProgramAssignmentUseCase,
    private readonly getCurrentProgram: GetCurrentProgramUseCase,
    private readonly listMyAchievements: ListMyAchievementsUseCase,
  ) {}

  // ── leitura do aluno (antes de :id pra não colidir) ────────────────────────

  // GET /api/programs/current — { currentProgram } (null quando não está em nenhum).
  // Embrulhado em objeto porque `null` puro vira corpo vazio e quebra o res.json() do front.
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Get('current')
  async current(@CurrentUser() authenticatedUser: AuthUser) {
    const currentProgram = await this.getCurrentProgram.execute(authenticatedUser.userId);
    return { currentProgram };
  }

  // GET /api/programs/achievements — medalhas do aluno
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Get('achievements')
  achievements(@CurrentUser() authenticatedUser: AuthUser) {
    return this.listMyAchievements.execute(authenticatedUser.userId);
  }

  // ── gestão (admin) ─────────────────────────────────────────────────────────

  // GET /api/programs/users/:userId/current — programa atual de um aluno (perfil no painel)
  @Roles(Role.ADMIN)
  @Get('users/:userId/current')
  async currentOfUser(@Param('userId') userId: string) {
    const currentProgram = await this.getCurrentProgram.execute(userId);
    return { currentProgram };
  }

  // GET /api/programs/users/:userId/achievements — medalhas de um aluno
  @Roles(Role.ADMIN)
  @Get('users/:userId/achievements')
  achievementsOfUser(@Param('userId') userId: string) {
    return this.listMyAchievements.execute(userId);
  }

  @Roles(Role.ADMIN)
  @Get()
  list() {
    return this.listPrograms.execute();
  }

  @Roles(Role.ADMIN)
  @Get(':id')
  detail(@Param('id') programId: string) {
    return this.getProgram.execute(programId);
  }

  // POST /api/programs { name, type, targetWeeks?, targetDays?, workoutIds, userIds }
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() createProgramDto: CreateProgramDto) {
    return this.createProgram.execute(createProgramDto);
  }

  // PATCH /api/programs/:id { name?, description?, workoutIds? }
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') programId: string, @Body() updateProgramDto: UpdateProgramDto) {
    return this.updateProgram.execute(programId, updateProgramDto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') programId: string) {
    return this.deleteProgram.execute(programId);
  }

  // POST /api/programs/:id/assignments { userIds } — coloca alunos no programa
  @Roles(Role.ADMIN)
  @Post(':id/assignments')
  @HttpCode(201)
  assign(@Param('id') programId: string, @Body() assignProgramDto: AssignProgramDto) {
    return this.assignProgramToUsers.execute(programId, assignProgramDto.userIds);
  }

  // PATCH /api/programs/assignments/:assignmentId/archive — tira o aluno do programa
  @Roles(Role.ADMIN)
  @Patch('assignments/:assignmentId/archive')
  archive(@Param('assignmentId') assignmentId: string) {
    return this.archiveProgramAssignment.execute(assignmentId);
  }
}
