import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { SupabaseStorageService } from '../../../../shared/storage/supabase-storage.service';
import { RegisterPhotoDto, RequestUploadDto } from '../dto/progress-photo.dto';

/** Bucket PRIVADO de fotos de progresso (criar no Supabase como "private"). */
export const PROGRESS_BUCKET = process.env.SUPABASE_PROGRESS_BUCKET ?? 'progress';
const READ_TTL_SEC = 60 * 60; // 1h

/** Anexa URL assinada de leitura a cada foto. */
async function withUrls(
  storage: SupabaseStorageService,
  photos: { id: string; userId: string; path: string; takenAt: Date; note: string | null }[],
) {
  return Promise.all(
    photos.map(async (p) => ({
      ...p,
      url: await storage.signedReadUrl(PROGRESS_BUCKET, p.path, READ_TTL_SEC),
    })),
  );
}

/** TRAINEE: pede URL assinada pra subir 1 foto. Caminho sempre prefixado pelo userId. */
@Injectable()
export class RequestPhotoUploadUseCase {
  constructor(private readonly storage: SupabaseStorageService) {}

  async execute(userId: string, dto: RequestUploadDto) {
    const path = `${userId}/${randomUUID()}.${dto.ext}`;
    const upload = await this.storage.signedUploadUrl(PROGRESS_BUCKET, path);
    return { path, uploadUrl: upload.signedUrl, token: upload.token };
  }
}

/** TRAINEE: registra a foto após o upload. Só aceita caminho do próprio usuário. */
@Injectable()
export class RegisterPhotoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string, dto: RegisterPhotoDto) {
    if (!dto.path.startsWith(`${userId}/`)) {
      throw new ForbiddenException('Caminho de foto inválido para este usuário');
    }
    return this.prisma.progressPhoto.create({
      data: {
        userId,
        path: dto.path,
        note: dto.note?.trim() || null,
        takenAt: dto.takenAt ? new Date(dto.takenAt) : undefined,
      },
    });
  }
}

/** Lista fotos de um usuário (a própria aluna, ou o ADMIN olhando um aluno). */
@Injectable()
export class ListPhotosUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async execute(userId: string) {
    const photos = await this.prisma.progressPhoto.findMany({
      where: { userId },
      orderBy: { takenAt: 'desc' },
      take: 200,
    });
    return withUrls(this.storage, photos);
  }
}

/** TRAINEE: apaga a própria foto (registro + arquivo). */
@Injectable()
export class DeletePhotoUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async execute(userId: string, photoId: string) {
    const photo = await this.prisma.progressPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('Foto não encontrada');
    if (photo.userId !== userId) throw new ForbiddenException('Foto de outro usuário');
    await this.prisma.progressPhoto.delete({ where: { id: photoId } });
    await this.storage.remove(PROGRESS_BUCKET, [photo.path]);
    return { ok: true };
  }
}
