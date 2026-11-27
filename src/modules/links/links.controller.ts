import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { Roles } from '../../shared/auth/roles.decorator';
import { clientIp, requestId, userAgent } from '../../shared/http/client-ip';
import { RequestLinkDto } from './application/dto/request-link.dto';
import {
  AcceptLinkUseCase,
  EndLinkUseCase,
  GetCurrentLinkUseCase,
  ListPendingLinksUseCase,
  ListSentLinksUseCase,
  RejectLinkUseCase,
  RequestLinkUseCase,
} from './application/use-cases/links.use-cases';

@Controller('links')
export class LinksController {
  constructor(
    private readonly requestLinkUseCase: RequestLinkUseCase,
    private readonly listSentLinksUseCase: ListSentLinksUseCase,
    private readonly listPendingLinksUseCase: ListPendingLinksUseCase,
    private readonly getCurrentLinkUseCase: GetCurrentLinkUseCase,
    private readonly acceptLinkUseCase: AcceptLinkUseCase,
    private readonly rejectLinkUseCase: RejectLinkUseCase,
    private readonly endLinkUseCase: EndLinkUseCase,
  ) {}

  // POST /api/links/request { username }  (PERSONAL)
  // Rate limit dedicado contra enumeração de apelidos / spam de convites.
  @Roles(Role.PERSONAL)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('request')
  request(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestLinkDto,
    @Req() req: Request,
  ) {
    return this.requestLinkUseCase.execute(user.userId, dto, {
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: requestId(req),
    });
  }

  // GET /api/links/sent  (PERSONAL) — solicitações pendentes e vínculos ativos do personal
  @Roles(Role.PERSONAL)
  @Get('sent')
  sent(@CurrentUser() user: AuthUser) {
    return this.listSentLinksUseCase.execute(user.userId);
  }

  // GET /api/links/pending  (TRAINEE) — convites pendentes recebidos pelo aluno
  @Roles(Role.TRAINEE)
  @Get('pending')
  pending(@CurrentUser() user: AuthUser) {
    return this.listPendingLinksUseCase.execute(user.userId);
  }

  // GET /api/links/current  (TRAINEE) — personal ativo atual do aluno (ou { link: null })
  @Roles(Role.TRAINEE)
  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.getCurrentLinkUseCase.execute(user.userId);
  }

  // POST /api/links/:id/accept  (TRAINEE) — confirma vínculo e executa Copy-on-Transfer
  @Roles(Role.TRAINEE)
  @Post(':id/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.acceptLinkUseCase.execute(user.userId, id, {
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: requestId(req),
    });
  }

  // POST /api/links/:id/reject  (TRAINEE)
  @Roles(Role.TRAINEE)
  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.rejectLinkUseCase.execute(user.userId, id, {
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: requestId(req),
    });
  }

  // POST /api/links/:id/end  (TRAINEE ou PERSONAL) — encerra vínculo ativo ou cancela convite
  @Roles(Role.TRAINEE, Role.PERSONAL)
  @Post(':id/end')
  @HttpCode(200)
  end(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.endLinkUseCase.execute(user.userId, user.role, id, {
      ip: clientIp(req),
      userAgent: userAgent(req),
      requestId: requestId(req),
    });
  }
}
