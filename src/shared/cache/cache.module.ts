import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Cache em memória do processo (LRU).
 *
 * `max` é teto de ENTRADAS, não de bytes — por isso o número é conservador.
 * Conta de guardanapo: a página maior do catálogo (200 exercícios) dá ~100 KB e
 * a típica (24) ~12 KB; 200 entradas ficam na casa de poucos MB, folgado nos
 * 512 MB do Render free. É a resposta ao risco "memória estourando".
 *
 * Uma instância só → memória basta. Quando virar multi-instância, troca-se o
 * store por Redis aqui e o `CacheService` não muda.
 */
@Global()
@Module({
  imports: [
    NestCacheModule.register({
      isGlobal: true,
      max: 200,
      ttl: 5 * 60 * 1000, // default; cada chamada passa o seu
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
