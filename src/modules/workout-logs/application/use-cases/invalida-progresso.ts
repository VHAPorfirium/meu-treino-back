import { CacheService } from '../../../../shared/cache/cache.service';

/**
 * Invalidação do resumo de progresso, num lugar só.
 *
 * Duas chaves, sempre as duas:
 *  - a do aluno (`u:<userId>|progress:v1`) — o dashboard filtrado por ele;
 *  - a do agregado (`u:all|progress:v1`) — o dashboard "Todos os alunos", que
 *    também muda quando qualquer aluno marca um exercício.
 *
 * Esquecer a segunda é o jeito mais fácil de o painel mostrar número velho — é
 * exatamente o risco "número velho no dashboard" do desenho, e o motivo de isso
 * ser uma função compartilhada em vez de duas linhas copiadas em cada use-case.
 *
 * Nunca lança: a escrita no banco já aconteceu e não pode falhar por causa do
 * cache. Na pior hipótese o TTL de 60 s resolve sozinho.
 */
export async function invalidarProgresso(
  cache: CacheService,
  userId: string,
): Promise<void> {
  await Promise.all([
    cache.invalidarUsuario(userId),
    cache.invalidarUsuario('all'),
  ]);
}
