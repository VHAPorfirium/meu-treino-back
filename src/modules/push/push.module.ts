import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './application/push.service';

@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
