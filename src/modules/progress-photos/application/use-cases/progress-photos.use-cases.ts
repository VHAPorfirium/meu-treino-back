import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { SupabaseStorageService } from '../../../../shared/storage/supabase-storage.service';
import { RegisterPhotoDto, RequestUploadDto } from '../dto/progress-photo.dto';

/** Bucket PRIVADO de fotos de progresso (criar no Supabase como "private"). */
export function getProgressBucket(): string {
  return process.env.SUPABASE_PROGRESS_BUCKET?.trim() || 'progress';
}
const READ_TTL_SEC = 60 * 60; // 1h

/** Anexa URL assinada de leitura a cada foto em uma única chamada em lote. */
async function withUrls(
  storage: SupabaseStorageService,
  photos: { id: string; userId: string; path: string; takenAt: Date; note: string | null }[],
) {
  if (photos.length === 0) return [];
  const bucket = getProgressBucket();
  const urls = await storage.signedReadUrls(
    bucket,
    photos.map((p) => p.path),
    READ_TTL_SEC,
  );
  return photos.map((p) => ({
    ...p,
    url: urls.get(p.path) ?? null,
  }));
}

/** TRAINEE: pede URL assinada pra subir 1 foto. Caminho sempre prefixado pelo userId. */
@Injectable()
export class RequestPhotoUploadUseCase {
  constructor(private readonly storage: SupabaseStorageService) {}

  async execute(userId: string, dto: RequestUploadDto) {
    const path = `${userId}/${randomUUID()}.${dto.ext}`;
    const upload = await this.storage.signedUploadUrl(getProgressBucket(), path);
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
    try {
      return await this.prisma.progressPhoto.create({
        data: {
          userId,
          path: dto.path,
          note: dto.note?.trim() || null,
          takenAt: dto.takenAt ? new Date(dto.takenAt) : undefined,
        },
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Esta foto já foi registrada');
      }
      throw err;
    }
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
    await this.storage.remove(getProgressBucket(), [photo.path]);
    return { ok: true };
  }
}
