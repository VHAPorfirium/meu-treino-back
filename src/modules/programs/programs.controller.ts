import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../shared/auth/roles.decorator';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { TrainerAccessService } from '../links/application/trainer-access.service';
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
    private readonly trainerAccess: TrainerAccessService,
  ) {}

  // ── leitura do aluno (antes de :id pra não colidir) ────────────────────────

  // GET /api/programs/current — { currentProgram } (null quando não está em nenhum).
  @Roles(Role.TRAINEE)
  @Get('current')
  async current(@CurrentUser() authenticatedUser: AuthUser) {
    const currentProgram = await this.getCurrentProgram.execute(authenticatedUser.userId);
    return { currentProgram };
  }

  // GET /api/programs/achievements — medalhas do aluno
  @Roles(Role.TRAINEE)
  @Get('achievements')
  achievements(@CurrentUser() authenticatedUser: AuthUser) {
    return this.listMyAchievements.execute(authenticatedUser.userId);
  }

  // ── gestão (personal) ──────────────────────────────────────────────────────

  // GET /api/programs/users/:userId/current — programa atual de um aluno vinculado
  @Roles(Role.PERSONAL)
  @Get('users/:userId/current')
  async currentOfUser(
    @CurrentUser() trainer: AuthUser,
    @Param('userId') userId: string,
  ) {
    await this.trainerAccess.assertActiveLink(trainer.userId, userId);
    const currentProgram = await this.getCurrentProgram.execute(userId);
    return { currentProgram };
  }

  // GET /api/programs/users/:userId/achievements — medalhas de um aluno vinculado
  @Roles(Role.PERSONAL)
  @Get('users/:userId/achievements')
  async achievementsOfUser(
    @CurrentUser() trainer: AuthUser,
    @Param('userId') userId: string,
  ) {
    await this.trainerAccess.assertActiveLink(trainer.userId, userId);
    return this.listMyAchievements.execute(userId);
  }

  @Roles(Role.PERSONAL)
  @Get()
  list(@CurrentUser() trainer: AuthUser) {
    return this.listPrograms.execute(trainer.userId);
  }

  @Roles(Role.PERSONAL)
  @Get(':id')
  detail(@CurrentUser() trainer: AuthUser, @Param('id') programId: string) {
    return this.getProgram.execute(programId, trainer.userId);
  }

  // POST /api/programs { name, type, targetWeeks?, targetDays?, workoutIds, userIds }
  @Roles(Role.PERSONAL)
  @Post()
  create(
    @CurrentUser() trainer: AuthUser,
    @Body() createProgramDto: CreateProgramDto,
  ) {
    return this.createProgram.execute(createProgramDto, trainer.userId);
  }

  // PATCH /api/programs/:id { name?, description?, workoutIds? }
  @Roles(Role.PERSONAL)
  @Patch(':id')
  update(
    @CurrentUser() trainer: AuthUser,
    @Param('id') programId: string,
    @Body() updateProgramDto: UpdateProgramDto,
  ) {
    return this.updateProgram.execute(programId, updateProgramDto, trainer.userId);
  }

  @Roles(Role.PERSONAL)
  @Delete(':id')
  remove(@CurrentUser() trainer: AuthUser, @Param('id') programId: string) {
    return this.deleteProgram.execute(programId, trainer.userId);
  }

  // POST /api/programs/:id/assignments { userIds } — coloca alunos vinculados no programa
  @Roles(Role.PERSONAL)
  @Post(':id/assignments')
  @HttpCode(201)
  assign(
    @CurrentUser() trainer: AuthUser,
    @Param('id') programId: string,
    @Body() assignProgramDto: AssignProgramDto,
  ) {
    return this.assignProgramToUsers.execute(
      programId,
      assignProgramDto.userIds,
      trainer.userId,
    );
  }

  // PATCH /api/programs/assignments/:assignmentId/archive — tira o aluno do programa
  @Roles(Role.PERSONAL)
  @Patch('assignments/:assignmentId/archive')
  archive(
    @CurrentUser() trainer: AuthUser,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.archiveProgramAssignment.execute(assignmentId, trainer.userId);
  }
}
