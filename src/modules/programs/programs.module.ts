import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PushModule } from '../push/push.module';
import { ProgramsController } from './programs.controller';
import { PROGRAM_REPOSITORY } from './domain/program.repository';
import { PrismaProgramRepository } from './infrastructure/prisma-program.repository';
import { ProgramProgressService } from './application/services/program-progress.service';
import { CreateProgramUseCase } from './application/use-cases/create-program.use-case';
import { UpdateProgramUseCase } from './application/use-cases/update-program.use-case';
import { DeleteProgramUseCase } from './application/use-cases/delete-program.use-case';
import { ListProgramsUseCase } from './application/use-cases/list-programs.use-case';
import { GetProgramUseCase } from './application/use-cases/get-program.use-case';
import { AssignProgramToUsersUseCase } from './application/use-cases/assign-program-to-users.use-case';
import { ArchiveProgramAssignmentUseCase } from './application/use-cases/archive-program-assignment.use-case';
import { GetCurrentProgramUseCase } from './application/use-cases/get-current-program.use-case';
import { ListMyAchievementsUseCase } from './application/use-cases/list-my-achievements.use-case';
import { CompleteProgramIfFinishedUseCase } from './application/use-cases/complete-program-if-finished.use-case';

@Module({
  imports: [UsersModule, PushModule],
  controllers: [ProgramsController],
  providers: [
    { provide: PROGRAM_REPOSITORY, useClass: PrismaProgramRepository },
    ProgramProgressService,
    CreateProgramUseCase,
    UpdateProgramUseCase,
    DeleteProgramUseCase,
    ListProgramsUseCase,
    GetProgramUseCase,
    AssignProgramToUsersUseCase,
    ArchiveProgramAssignmentUseCase,
    GetCurrentProgramUseCase,
    ListMyAchievementsUseCase,
    CompleteProgramIfFinishedUseCase,
  ],
  // usado pelo módulo workout-logs ao finalizar uma sessão
  exports: [CompleteProgramIfFinishedUseCase],
})
export class ProgramsModule {}
