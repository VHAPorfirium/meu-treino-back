import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../shared/auth/roles.decorator';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthUser } from '../../shared/auth/jwt-payload';
import { RegisterPhotoDto, RequestUploadDto } from './application/dto/progress-photo.dto';
import {
  DeletePhotoUseCase,
  ListPhotosUseCase,
  RegisterPhotoUseCase,
  RequestPhotoUploadUseCase,
} from './application/use-cases/progress-photos.use-cases';

@Controller('progress-photos')
export class ProgressPhotosController {
  constructor(
    private readonly requestUpload: RequestPhotoUploadUseCase,
    private readonly register: RegisterPhotoUseCase,
    private readonly list: ListPhotosUseCase,
    private readonly remove: DeletePhotoUseCase,
  ) {}

  // POST /api/progress-photos/upload-url { ext }  (TRAINEE) → { path, uploadUrl, token }
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Post('upload-url')
  @HttpCode(200)
  uploadUrl(@CurrentUser() user: AuthUser, @Body() dto: RequestUploadDto) {
    return this.requestUpload.execute(user.userId, dto);
  }

  // POST /api/progress-photos { path, note?, takenAt? }  (TRAINEE) — registra após o upload
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: RegisterPhotoDto) {
    return this.register.execute(user.userId, dto);
  }

  // GET /api/progress-photos  (TRAINEE) — minhas fotos com URL assinada
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.list.execute(user.userId);
  }

  // GET /api/progress-photos/user/:userId  (ADMIN) — fotos de um aluno
  @Roles(Role.ADMIN)
  @Get('user/:userId')
  ofUser(@Param('userId') userId: string) {
    return this.list.execute(userId);
  }

  // DELETE /api/progress-photos/:id  (TRAINEE) — apaga a própria foto
  @Roles(Role.TRAINEE, Role.ADMIN)
  @Delete(':id')
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.remove.execute(user.userId, id);
  }
}
