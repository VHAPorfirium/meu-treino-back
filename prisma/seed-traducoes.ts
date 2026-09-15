/**
 * E11 — preenche as colunas pt-BR do catálogo.
 *
 *   npm run seed:traducoes              aplica no banco
 *   npm run seed:traducoes -- --relatorio   só mostra a cobertura, não escreve
 *
 * Onda 1 (equipamento e músculo): dicionário fechado, 100% de cobertura.
 * Onda 2 (nomes): só grava o que o glossário cobre com segurança; o resto fica
 * em inglês e a API faz fallback. Rodar de novo depois de crescer o glossário
 * é seguro — é idempotente.
 *
 * ⚠️ Depois de rodar em produção, **redeploy**: o catálogo tem cache de 6 h
 * (Frente G) e continuaria servindo os nomes antigos.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { traduzNome } from './traducoes/traduz-nome';

const prisma = new PrismaClient();
const dir = path.join(__dirname, 'traducoes');
const ler = (f: string): Record<string, string> =>
  JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));

const EQUIPAMENTOS = ler('equipamentos.json');
const MUSCULOS = ler('musculos.json');

async function main() {
  const soRelatorio = process.argv.includes('--relatorio');
  const exercicios = await prisma.exercise.findMany({
    select: { id: true, name: true, equipment: true, target: true },
  });

  let comEquip = 0;
  let comMusculo = 0;
  let comNome = 0;
  const semEquip = new Set<string>();
  const semMusculo = new Set<string>();
  const faltantes = new Map<string, number>();
  const atualizacoes: { id: string; data: Record<string, string> }[] = [];

  for (const ex of exercicios) {
    const data: Record<string, string> = {};

    const eq = ex.equipment?.toLowerCase().trim();
    if (eq) {
      if (EQUIPAMENTOS[eq]) {
        data.equipmentPt = EQUIPAMENTOS[eq];
        comEquip++;
      } else semEquip.add(eq);
    }

    const alvo = ex.target?.toLowerCase().trim();
    if (alvo) {
      if (MUSCULOS[alvo]) {
        data.targetPt = MUSCULOS[alvo];
        comMusculo++;
      } else semMusculo.add(alvo);
    }

    const { pt, faltando } = traduzNome(ex.name);
    if (pt) {
      data.namePt = pt;
      comNome++;
    } else {
      for (const w of faltando) faltantes.set(w, (faltantes.get(w) ?? 0) + 1);
    }

    if (Object.keys(data).length) atualizacoes.push({ id: ex.id, data });
  }

  const total = exercicios.length;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  console.log(`\nCatálogo: ${total} exercícios`);
  console.log(`  equipamento em pt : ${comEquip} (${pct(comEquip)})`);
  console.log(`  músculo em pt     : ${comMusculo} (${pct(comMusculo)})`);
  console.log(`  NOME em pt        : ${comNome} (${pct(comNome)})  ← onda 2`);
  if (semEquip.size) console.log(`  ⚠️ equipamentos sem tradução: ${[...semEquip].join(', ')}`);
  if (semMusculo.size) console.log(`  ⚠️ músculos sem tradução: ${[...semMusculo].join(', ')}`);

  const top = [...faltantes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  if (top.length) {
    console.log(`\n  Palavras que mais faltam no glossário (trabalho da onda 2):`);
    console.log('  ' + top.map(([w, c]) => `${w}(${c})`).join(', '));
  }

  if (soRelatorio) {
    console.log('\n(--relatorio: nada foi gravado)\n');
    return;
  }

  // lotes pequenos: o pooler do Supabase tem connection_limit=1
  const LOTE = 50;
  for (let i = 0; i < atualizacoes.length; i += LOTE) {
    await prisma.$transaction(
      atualizacoes.slice(i, i + LOTE).map((u) =>
        prisma.exercise.update({ where: { id: u.id }, data: u.data }),
      ),
    );
  }
  console.log(`\n✅ ${atualizacoes.length} exercícios atualizados.`);
  console.log('   Lembre do redeploy: o catálogo tem cache de 6 h (Frente G).\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
