import { Global, Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { LinksController } from './links.controller';
import { TrainerAccessService } from './application/trainer-access.service';
import {
  AcceptLinkUseCase,
  EndLinkUseCase,
  GetCurrentLinkUseCase,
  ListPendingLinksUseCase,
  ListSentLinksUseCase,
  RejectLinkUseCase,
  RequestLinkUseCase,
} from './application/use-cases/links.use-cases';

@Global()
@Module({
  imports: [PushModule],
  controllers: [LinksController],
  providers: [
    TrainerAccessService,
    RequestLinkUseCase,
    ListSentLinksUseCase,
    ListPendingLinksUseCase,
    GetCurrentLinkUseCase,
    AcceptLinkUseCase,
    RejectLinkUseCase,
    EndLinkUseCase,
  ],
  exports: [TrainerAccessService],
})
export class LinksModule {}
