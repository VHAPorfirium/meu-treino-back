import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

/** TTLs em ms, num lugar só. */
export const TTL = {
  /** catálogo de exercícios: só muda em reseed */
  CATALOGO: 6 * 60 * 60 * 1000,
  /** resumo de progresso: rede de segurança — a invalidação é quem manda */
  PROGRESSO: 60 * 1000,
} as const;

/**
 * Cache em memória do processo.
 *
 * ── A regra de segurança está no TIPO, não na disciplina ────────────────────
 * Não existe um `lembrar(chave, ...)` genérico. Existem dois métodos:
 *
 *   • `lembrarGlobal`      — para resposta IDÊNTICA para qualquer usuário
 *                            (catálogo de exercícios, grupos musculares).
 *   • `lembrarDoUsuario`   — para resposta que depende de um usuário; o `userId`
 *                            é o PRIMEIRO parâmetro e não tem default.
 *
 * Assim é impossível cachear uma rota por usuário "esquecendo" a chave: não há
 * assinatura que aceite isso. É a resposta ao risco nº 1 do desenho (o
 * `CacheInterceptor` global do Nest keya por URL e serviria a resposta de um
 * usuário para outro).
 *
 * As chaves finais ficam com namespace explícito — `g|…` e `u:<id>|…` — então
 * uma chave global nunca colide com uma de usuário, nem vice-versa.
 */
@Injectable()
export class CacheService {
  private readonly log = new Logger('Cache');
  private acertos = 0;
  private erros = 0;
  /** requisições em voo por chave — evita N consultas iguais no mesmo instante. */
  private readonly emVoo = new Map<string, Promise<unknown>>();

  /** `CACHE_ENABLED=false` no Render desliga tudo sem redeploy de código. */
  readonly ativo: boolean;

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {
    this.ativo = (process.env.CACHE_ENABLED ?? 'true').toLowerCase() !== 'false';
    if (!this.ativo) this.log.warn('CACHE_ENABLED=false — cache desligado');
  }

  /** Resposta idêntica para qualquer usuário autenticado. */
  lembrarGlobal<T>(chave: string, ttlMs: number, produzir: () => Promise<T>) {
    return this.lembrar(`g|${chave}`, ttlMs, produzir);
  }

  /**
   * Resposta que depende de um usuário — `userId` obrigatório e sem default.
   * Use `'all'` quando a resposta for deliberadamente o agregado de todos.
   */
  async lembrarDoUsuario<T>(
    userId: string,
    chave: string,
    ttlMs: number,
    produzir: () => Promise<T>,
  ): Promise<T> {
    // `async` de propósito: assim isso REJEITA a promise em vez de estourar de
    // forma síncrona — um `.catch()` no chamador pegaria o erro nos dois casos.
    if (!userId) {
      // defensivo: chave de usuário vazia viraria um balde compartilhado
      throw new Error('cache: userId vazio em lembrarDoUsuario');
    }
    return this.lembrar(`u:${userId}|${chave}`, ttlMs, produzir);
  }

  private async lembrar<T>(
    chave: string,
    ttlMs: number,
    produzir: () => Promise<T>,
  ): Promise<T> {
    if (!this.ativo) return produzir();

    const guardado = await this.cache.get<T>(chave);
    if (guardado !== undefined && guardado !== null) {
      this.acertos++;
      return guardado;
    }

    // Single-flight: com `connection_limit=1` no pooler, 5 requisições iguais
    // chegando juntas num cache frio virariam 5 consultas enfileiradas. Aqui
    // vira uma só, e as outras esperam o mesmo resultado.
    const jaEmVoo = this.emVoo.get(chave) as Promise<T> | undefined;
    if (jaEmVoo) return jaEmVoo;

    this.erros++;
    const promessa = produzir()
      .then(async (valor) => {
        if (valor !== undefined && valor !== null) {
          await this.cache.set(chave, valor, ttlMs);
        }
        return valor;
      })
      .finally(() => this.emVoo.delete(chave));

    this.emVoo.set(chave, promessa);
    return promessa;
  }

  /** Apaga tudo que é daquele usuário (todas as chaves `u:<id>|…`). */
  invalidarUsuario(userId: string): Promise<number> {
    return this.apagarPorPrefixo(`u:${userId}|`);
  }

  /** Apaga chaves globais por prefixo — ex.: `invalidarGlobal('ex:')`. */
  invalidarGlobal(prefixo: string): Promise<number> {
    return this.apagarPorPrefixo(`g|${prefixo}`);
  }

  private async apagarPorPrefixo(prefixo: string): Promise<number> {
    if (!this.ativo) return 0;
    try {
      // São centenas de chaves em memória, não milhões: varrer é barato.
      // (No dia do Redis, este é o ÚNICO ponto que vira SCAN/tag.)
      const chaves = (await this.cache.store.keys()) ?? [];
      const alvo = chaves.filter((k) => k.startsWith(prefixo));
      await Promise.all(alvo.map((k) => this.cache.del(k)));
      return alvo.length;
    } catch (e) {
      // cache quebrado nunca pode derrubar uma escrita que já foi pro banco
      this.log.error(`falha ao invalidar "${prefixo}": ${(e as Error).message}`);
      return 0;
    }
  }

  async estatisticas() {
    let entradas = 0;
    try {
      entradas = ((await this.cache.store.keys()) ?? []).length;
    } catch {
      /* ignore */
    }
    const total = this.acertos + this.erros;
    return {
      enabled: this.ativo,
      entradas,
      hits: this.acertos,
      misses: this.erros,
      taxaAcerto: total ? Math.round((this.acertos / total) * 100) : 0,
      emVoo: this.emVoo.size,
    };
  }
}
