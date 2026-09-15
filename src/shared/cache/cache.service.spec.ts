import { caching } from 'cache-manager';
import type { Cache } from 'cache-manager';
import { CacheService } from './cache.service';
import { invalidarProgresso } from '../../modules/workout-logs/application/use-cases/invalida-progresso';

/**
 * Estes testes existem por um motivo específico: o desenho da Frente G lista
 * quatro riscos, e cada `describe` abaixo prova que um deles não acontece.
 * Se algum quebrar, é um dos riscos voltando — não um detalhe de implementação.
 */
async function novoCache(opts: { max?: number; ttl?: number } = {}) {
  const store: Cache = await caching('memory', {
    max: opts.max ?? 100,
    ttl: opts.ttl ?? 60_000,
  });
  return new CacheService(store);
}

describe('RISCO 1 — vazar dado entre usuários', () => {
  it('dois usuários com a MESMA chave lógica não enxergam o dado um do outro', async () => {
    const cache = await novoCache();

    const daNinfa = await cache.lembrarDoUsuario('ninfa', 'progress:v1', 60_000, () =>
      Promise.resolve({ sessoes: 12 }),
    );
    const doVictor = await cache.lembrarDoUsuario('victor', 'progress:v1', 60_000, () =>
      Promise.resolve({ sessoes: 3 }),
    );

    expect(daNinfa).toEqual({ sessoes: 12 });
    expect(doVictor).toEqual({ sessoes: 3 }); // <- o bug seria devolver 12 aqui
  });

  it('chave global não colide com chave de usuário de mesmo nome', async () => {
    const cache = await novoCache();
    await cache.lembrarGlobal('x', 60_000, () => Promise.resolve('global'));
    const doUsuario = await cache.lembrarDoUsuario('ninfa', 'x', 60_000, () =>
      Promise.resolve('da ninfa'),
    );
    expect(doUsuario).toBe('da ninfa');
  });

  it('recusa userId vazio em vez de criar um balde compartilhado', async () => {
    const cache = await novoCache();
    await expect(
      cache.lembrarDoUsuario('', 'progress:v1', 60_000, () => Promise.resolve(1)),
    ).rejects.toThrow(/userId vazio/);
  });

  it('invalidar um usuário não apaga o do outro nem o global', async () => {
    const cache = await novoCache();
    await cache.lembrarDoUsuario('ninfa', 'k', 60_000, () => Promise.resolve('n'));
    await cache.lembrarDoUsuario('victor', 'k', 60_000, () => Promise.resolve('v'));
    await cache.lembrarGlobal('k', 60_000, () => Promise.resolve('g'));

    await cache.invalidarUsuario('ninfa');

    let recalculouNinfa = false;
    await cache.lembrarDoUsuario('ninfa', 'k', 60_000, () => {
      recalculouNinfa = true;
      return Promise.resolve('n2');
    });
    expect(recalculouNinfa).toBe(true);

    let recalculouVictor = false;
    const v = await cache.lembrarDoUsuario('victor', 'k', 60_000, () => {
      recalculouVictor = true;
      return Promise.resolve('v2');
    });
    expect(recalculouVictor).toBe(false);
    expect(v).toBe('v');
  });
});

describe('RISCO 2 — número velho no dashboard', () => {
  it('marcar exercício invalida o resumo do aluno E o agregado "all"', async () => {
    const cache = await novoCache();
    await cache.lembrarDoUsuario('ninfa', 'progress:v1', 60_000, () =>
      Promise.resolve({ sessoes: 1 }),
    );
    await cache.lembrarDoUsuario('all', 'progress:v1', 60_000, () =>
      Promise.resolve({ sessoes: 4 }),
    );

    await invalidarProgresso(cache, 'ninfa');

    const alunoRecalculado = await cache.lembrarDoUsuario(
      'ninfa',
      'progress:v1',
      60_000,
      () => Promise.resolve({ sessoes: 2 }),
    );
    // o "Todos os alunos" também muda quando UM aluno marca — esquecer isso é
    // o jeito mais fácil de o painel mostrar número velho
    const agregadoRecalculado = await cache.lembrarDoUsuario(
      'all',
      'progress:v1',
      60_000,
      () => Promise.resolve({ sessoes: 5 }),
    );

    expect(alunoRecalculado).toEqual({ sessoes: 2 });
    expect(agregadoRecalculado).toEqual({ sessoes: 5 });
  });

  it('o TTL expira sozinho, mesmo sem invalidação', async () => {
    const cache = await novoCache();
    await cache.lembrarGlobal('k', 30, () => Promise.resolve('velho'));
    await new Promise((r) => setTimeout(r, 60));
    const novo = await cache.lembrarGlobal('k', 30, () => Promise.resolve('novo'));
    expect(novo).toBe('novo');
  });

  it('invalidação nunca lança — a escrita no banco não pode falhar por causa do cache', async () => {
    const cache = await novoCache();
    (cache as unknown as { cache: { store: { keys: () => Promise<string[]> } } }).cache.store.keys =
      () => Promise.reject(new Error('store morreu'));
    await expect(invalidarProgresso(cache, 'ninfa')).resolves.toBeUndefined();
  });
});

describe('RISCO 3 — memória crescendo sem teto', () => {
  it('respeita o `max` de entradas (LRU descarta as antigas)', async () => {
    const cache = await novoCache({ max: 3 });
    for (let i = 0; i < 10; i++) {
      await cache.lembrarGlobal(`k${i}`, 60_000, () => Promise.resolve(i));
    }
    const { entradas } = await cache.estatisticas();
    expect(entradas).toBeLessThanOrEqual(3);
  });
});

describe('RISCO 4 — cache mascarando bug de query', () => {
  it('CACHE_ENABLED=false executa sempre e não guarda nada', async () => {
    const anterior = process.env.CACHE_ENABLED;
    process.env.CACHE_ENABLED = 'false';
    try {
      const cache = await novoCache();
      let execucoes = 0;
      const rodar = () =>
        cache.lembrarGlobal('k', 60_000, () => {
          execucoes++;
          return Promise.resolve(execucoes);
        });
      await rodar();
      await rodar();
      await rodar();
      expect(execucoes).toBe(3);
      expect((await cache.estatisticas()).enabled).toBe(false);
    } finally {
      process.env.CACHE_ENABLED = anterior;
    }
  });
});

describe('comportamento de base', () => {
  it('o segundo acesso não reexecuta a consulta', async () => {
    const cache = await novoCache();
    let execucoes = 0;
    const rodar = () =>
      cache.lembrarGlobal('k', 60_000, () => {
        execucoes++;
        return Promise.resolve('v');
      });
    await rodar();
    await rodar();
    expect(execucoes).toBe(1);
    expect((await cache.estatisticas()).hits).toBe(1);
  });

  it('single-flight: 5 chamadas simultâneas viram 1 consulta', async () => {
    const cache = await novoCache();
    let execucoes = 0;
    const lento = () =>
      cache.lembrarGlobal('k', 60_000, async () => {
        execucoes++;
        await new Promise((r) => setTimeout(r, 30));
        return 'v';
      });
    const todos = await Promise.all([lento(), lento(), lento(), lento(), lento()]);
    // com `connection_limit=1` no pooler, 5 consultas iguais enfileirariam
    expect(execucoes).toBe(1);
    expect(todos).toEqual(['v', 'v', 'v', 'v', 'v']);
  });

  it('não guarda null — 404 não pode virar resposta cacheada por 6 h', async () => {
    const cache = await novoCache();
    let execucoes = 0;
    const rodar = () =>
      cache.lembrarGlobal('inexistente', 60_000, () => {
        execucoes++;
        return Promise.resolve(null);
      });
    await rodar();
    await rodar();
    expect(execucoes).toBe(2);
  });
});
