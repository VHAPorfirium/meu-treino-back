import * as fs from 'fs';
import * as path from 'path';

/**
 * E11 — tradutor de nomes de exercício (onda 2).
 *
 * Não é tradução palavra-a-palavra: a ordem do português é outra. O nome é
 * remontado como **núcleo do movimento → parte do corpo → modificadores →
 * equipamento no fim**, que é como se fala na academia:
 *
 *   "seated dumbbell biceps curl"  ->  "Rosca bíceps sentado com halteres"
 *
 * O glossário (`glossario-nomes.json`) é a única coisa que cresce na onda 2 —
 * este motor não muda. `traduzNome` devolve `null` quando NÃO tem confiança, e
 * aí o nome fica em inglês: **meia tradução é pior que nenhuma**.
 */

interface Glossario {
  frases: Record<string, string>;
  nucleos: Record<string, string>;
  modificadores: Record<string, string>;
  partesDoCorpo: Record<string, string>;
  equipamentoNoFim: Record<string, string>;
  ignorar: string[];
  /** núcleos que JÁ nomeiam o aparelho — não repetir "na máquina" depois deles */
  _maquinaImplicita: string[];
}

const G: Glossario = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'glossario-nomes.json'), 'utf-8'),
);

const IGNORAR = new Set(G.ignorar.map((s) => s.toLowerCase()));
/** chaves longas primeiro: "incline bench press" tem que ganhar de "bench press". */
const porTamanho = (o: Record<string, string>) =>
  Object.keys(o).sort((a, b) => b.length - a.length);

const FRASES = porTamanho(G.frases);
const EQUIPS = porTamanho(G.equipamentoNoFim);

const escapa = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const comoPalavra = (termo: string) => new RegExp(`\\b${escapa(termo)}\\b`, 'i');

function normaliza(nome: string): string {
  return nome
    .toLowerCase()
    .replace(/\((male|female)\)/g, ' ')
    .replace(/\bv\.?\s*\d+\b/g, ' ') // "V. 3"
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ResultadoTraducao {
  /** null quando o glossário não cobre o nome com segurança */
  pt: string | null;
  /** palavras que ficaram de fora — é a lista de trabalho da onda 2 */
  faltando: string[];
}

export function traduzNome(nome: string): ResultadoTraducao {
  let resto = normaliza(nome);
  let nucleo: string | null = null;

  // 1) frases inteiras primeiro — é onde mora a qualidade ("bench press" != "banco pressão")
  for (const f of FRASES) {
    const re = comoPalavra(f);
    if (re.test(resto)) {
      nucleo = G.frases[f];
      resto = resto.replace(re, ' ');
      break;
    }
  }

  // 2) equipamento sai da frase e volta no fim
  // Consome TODOS os equipamentos citados, não só o primeiro: nomes como
  // "cable rope triceps pushdown" citam dois, e o que sobrasse viraria uma
  // palavra desconhecida que reprovaria o nome inteiro no portão de qualidade.
  // O sufixo fica com o primeiro (a lista está ordenada do mais específico).
  let sufixoEquip: string | null = null;
  for (const e of EQUIPS) {
    const re = comoPalavra(e);
    if (re.test(resto)) {
      sufixoEquip ??= G.equipamentoNoFim[e];
      resto = resto.replace(new RegExp(`\\b${escapa(e)}\\b`, 'gi'), ' ');
    }
  }

  const palavras = (resto.match(/[a-z][a-z'-]*/g) ?? []).filter(
    (w) => !IGNORAR.has(w),
  );

  const alvo: string[] = [];
  const sufixos: string[] = [];
  const faltando: string[] = [];

  for (const w of palavras) {
    if (!nucleo && G.nucleos[w]) nucleo = G.nucleos[w];
    else if (G.partesDoCorpo[w]) alvo.push(G.partesDoCorpo[w]);
    else if (G.modificadores[w]) sufixos.push(G.modificadores[w]);
    else if (G.nucleos[w]) sufixos.push(G.nucleos[w].toLowerCase());
    else faltando.push(w);
  }

  // Portão de qualidade: sem núcleo, ou com palavra desconhecida, não traduz.
  if (!nucleo || faltando.length > 0) return { pt: null, faltando };

  // "Cadeira extensora na máquina" é redundante: a cadeira JÁ é a máquina.
  // Quando o núcleo nomeia o aparelho, o sufixo genérico some.
  if (
    sufixoEquip === 'na máquina' &&
    G._maquinaImplicita.some((t) => nucleo!.toLowerCase().includes(t.toLowerCase()))
  ) {
    sufixoEquip = null;
  }

  const pedacos = [nucleo, ...alvo, ...sufixos, ...(sufixoEquip ? [sufixoEquip] : [])];

  // Tira repetição de palavra ("Flexão lateral" + "lateral"), mas NUNCA deixa
  // preposição órfã: retirar "barra" de "com barra" deixaria um "com" solto no
  // fim da frase. Se o pedaço virar só preposição, ele some inteiro.
  const PREPOSICOES = new Set([
    'com', 'na', 'no', 'nas', 'nos', 'de', 'da', 'do', 'em', 'a', 'o', 'e', 'ao',
  ]);
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const p of pedacos) {
    const tokens = p.split(' ');
    const mantidos = tokens.filter(
      (t) => PREPOSICOES.has(t.toLowerCase()) || !vistos.has(t.toLowerCase()),
    );
    tokens.forEach((t) => vistos.add(t.toLowerCase()));
    // sobrou só preposição → o conteúdo já foi dito antes, o pedaço não agrega
    if (!mantidos.length || mantidos.every((t) => PREPOSICOES.has(t.toLowerCase()))) {
      continue;
    }
    saida.push(mantidos.join(' '));
  }

  return { pt: saida.join(' '), faltando: [] };
}
