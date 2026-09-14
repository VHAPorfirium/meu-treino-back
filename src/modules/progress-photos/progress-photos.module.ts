import { Module } from '@nestjs/common';
import { ProgressPhotosController } from './progress-photos.controller';
import {
  DeletePhotoUseCase,
  ListPhotosUseCase,
  RegisterPhotoUseCase,
  RequestPhotoUploadUseCase,
} from './application/use-cases/progress-photos.use-cases';

@Module({
  controllers: [ProgressPhotosController],
  providers: [
    RequestPhotoUploadUseCase,
    RegisterPhotoUseCase,
    ListPhotosUseCase,
    DeletePhotoUseCase,
  ],
})
export class ProgressPhotosModule {}
