import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { GetAdminOverviewUseCase } from './application/get-admin-overview.use-case';

@Module({
  controllers: [AdminController],
  providers: [GetAdminOverviewUseCase],
})
export class AdminModule {}
