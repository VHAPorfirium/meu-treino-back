import { Module } from '@nestjs/common';
import { MuscleGroupsController } from './muscle-groups.controller';

@Module({
  controllers: [MuscleGroupsController],
})
export class MuscleGroupsModule {}
