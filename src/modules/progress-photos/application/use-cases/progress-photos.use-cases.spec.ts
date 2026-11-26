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

  it('isola fotos por trainerLinkId na visão do personal (Personal B só vê fotos do vínculo atual)', async () => {
    const prisma = {
      progressPhoto: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p-link-b',
            userId: 'u-aluna',
            path: 'u-aluna/nova.jpg',
            takenAt: new Date('2026-11-26'),
            note: null,
            trainerLinkId: 'link-b',
          },
        ]),
      },
    } as unknown as PrismaService;
    const storage = {
      signedReadUrls: jest
        .fn()
        .mockResolvedValue(new Map([['u-aluna/nova.jpg', 'https://signed/nova']])),
    } as unknown as SupabaseStorageService;
    const trainerAccess = {
      assertActiveLink: jest.fn().mockResolvedValue({ id: 'link-b' }),
    };

    const useCase = new ListPhotosUseCase(prisma, storage, trainerAccess as never);
    const res = await useCase.executeForTrainer('personal-b', 'u-aluna');

    expect(trainerAccess.assertActiveLink).toHaveBeenCalledWith('personal-b', 'u-aluna');
    expect(prisma.progressPhoto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u-aluna', trainerLinkId: 'link-b' },
      }),
    );
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('p-link-b');
  });
});
