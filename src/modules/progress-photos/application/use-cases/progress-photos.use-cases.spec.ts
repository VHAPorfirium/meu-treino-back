import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { SupabaseStorageService } from '../../../../shared/storage/supabase-storage.service';
import { ListPhotosUseCase } from './progress-photos.use-cases';

describe('ListPhotosUseCase — assinatura em lote', () => {
  it('busca todas as URLs assinadas em uma única chamada signedReadUrls', async () => {
    const photos = [
      { id: 'p1', userId: 'u1', path: 'u1/a.jpg', takenAt: new Date('2026-11-01'), note: null },
      { id: 'p2', userId: 'u1', path: 'u1/b.jpg', takenAt: new Date('2026-11-02'), note: 'frente' },
    ];
    const prisma = {
      progressPhoto: { findMany: jest.fn().mockResolvedValue(photos) },
    } as unknown as PrismaService;
    const storage = {
      signedReadUrl: jest.fn(),
      signedReadUrls: jest.fn().mockResolvedValue(
        new Map<string, string | null>([
          ['u1/a.jpg', 'https://storage.local/a?token=1'],
          ['u1/b.jpg', null],
        ]),
      ),
    } as unknown as SupabaseStorageService;

    const useCase = new ListPhotosUseCase(prisma, storage);
    const result = await useCase.execute('u1');

    expect(storage.signedReadUrl).not.toHaveBeenCalled();
    expect(storage.signedReadUrls).toHaveBeenCalledTimes(1);
    expect(storage.signedReadUrls).toHaveBeenCalledWith(
      expect.any(String),
      ['u1/a.jpg', 'u1/b.jpg'],
      3600,
    );
    expect(result).toEqual([
      { ...photos[0], url: 'https://storage.local/a?token=1' },
      { ...photos[1], url: null },
    ]);
  });

  it('não chama storage quando o usuário ainda não tem fotos', async () => {
    const prisma = {
      progressPhoto: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const storage = {
      signedReadUrls: jest.fn(),
    } as unknown as SupabaseStorageService;

    const useCase = new ListPhotosUseCase(prisma, storage);
    expect(await useCase.execute('u1')).toEqual([]);
    expect(storage.signedReadUrls).not.toHaveBeenCalled();
  });
});
