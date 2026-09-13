/**
 * Seed do catálogo de exercícios (dataset hasaneyldrm/exercises-dataset).
 *
 * Etapas:
 *  1. Lê exercises.json local (DATASET_PATH)
 *  2. Cria MuscleGroups a partir dos 10 body_parts (com displayName pt-BR)
 *  3. Traduz instruções pt-BR (provider plugável + cache determinístico)
 *  4. Resolve mídia (raw GitHub OU upload Supabase Storage)
 *  5. Upsert de Exercises (idempotente por externalId)
 *  6. Gera ExerciseAlternative (mesmo target+bodyPart, equipamento diferente, com cap)
 *  7. Cria os 3 usuários (Admin, Victor, Ninfa) via syncUsers — PIN em hash argon2
 *
 * Rode com: npm run seed
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { syncUsers } from './seed-users';

const prisma = new PrismaClient();

// ---------- config ----------
const DATASET_PATH = process.env.DATASET_PATH ?? '../exercises-dataset';
const RAW_BASE =
  'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/';

const TRANSLATION_PROVIDER = (process.env.TRANSLATION_PROVIDER ?? 'none') as
  | 'none'
  | 'libretranslate';
const LIBRETRANSLATE_URL =
  process.env.LIBRETRANSLATE_URL ?? 'https://libretranslate.com/translate';
const LIBRETRANSLATE_API_KEY = process.env.LIBRETRANSLATE_API_KEY ?? '';

const MEDIA_PROVIDER = (process.env.MEDIA_PROVIDER ?? 'none') as
  | 'none'
  | 'supabase';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET ?? 'exercises';

const MAX_ALTERNATIVES = 6;
const TRANSLATION_CACHE = path.join(__dirname, 'translations.pt-BR.json');

// rótulos pt-BR dos 10 body_parts do dataset
const BODY_PART_PT: Record<string, string> = {
  back: 'Costas',
  cardio: 'Cardio',
  chest: 'Peito',
  'lower arms': 'Antebraços',
  'lower legs': 'Panturrilhas',
  neck: 'Pescoço',
  shoulders: 'Ombros',
  'upper arms': 'Braços',
  'upper legs': 'Pernas',
  waist: 'Abdômen',
};

interface RawExercise {
  id: string;
  name: string;
  body_part: string;
  equipment: string;
  target: string;
  instructions: Record<string, string>;
  image: string;
  gif_url: string;
  attribution?: string;
}

// ---------- helpers ----------
function loadDataset(): RawExercise[] {
  const file = path.resolve(process.cwd(), DATASET_PATH, 'data/exercises.json');
  if (!fs.existsSync(file)) {
    throw new Error(
      `Dataset não encontrado em ${file}. Ajuste DATASET_PATH no .env`,
    );
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as RawExercise[];
}

// ----- tradução -----
let cache: Record<string, string> = {};
function loadCache() {
  try {
    cache = JSON.parse(fs.readFileSync(TRANSLATION_CACHE, 'utf-8'));
  } catch {
    cache = {};
  }
}
function saveCache() {
  fs.writeFileSync(TRANSLATION_CACHE, JSON.stringify(cache, null, 2));
}

async function libreTranslate(text: string): Promise<string> {
  const res = await fetch(LIBRETRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source: 'en',
      target: 'pt',
      format: 'text',
      ...(LIBRETRANSLATE_API_KEY ? { api_key: LIBRETRANSLATE_API_KEY } : {}),
    }),
  });
  if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`);
  const data = (await res.json()) as { translatedText: string };
  return data.translatedText;
}

async function translatePt(
  externalId: string,
  en: string,
): Promise<string | null> {
  if (!en) return null;
  if (TRANSLATION_PROVIDER === 'none') return null; // mantém só o inglês
  if (cache[externalId]) return cache[externalId];
  try {
    const pt = await libreTranslate(en);
    cache[externalId] = pt;
    return pt;
  } catch (e) {
    console.warn(`  ! tradução falhou p/ ${externalId}: ${(e as Error).message}`);
    return null;
  }
}

// ----- mídia -----
let supabase: any = null;
function initSupabase() {
  if (MEDIA_PROVIDER !== 'supabase') return;
  if (!SUPABASE_URL || !SUPABASE_KEY)
    throw new Error('MEDIA_PROVIDER=supabase exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  // require dinâmico p/ não quebrar quando provider = none
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

async function resolveMedia(relPath: string): Promise<string> {
  if (MEDIA_PROVIDER === 'none') return RAW_BASE + relPath;

  const localFile = path.resolve(process.cwd(), DATASET_PATH, relPath);
  if (!fs.existsSync(localFile)) return RAW_BASE + relPath; // fallback
  const buffer = fs.readFileSync(localFile);
  const contentType = relPath.endsWith('.gif') ? 'image/gif' : 'image/jpeg';
  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(relPath, buffer, { contentType, upsert: true });
  if (error && !String(error.message).includes('exists')) {
    console.warn(`  ! upload falhou ${relPath}: ${error.message}`);
    return RAW_BASE + relPath;
  }
  const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(relPath);
  return data.publicUrl;
}

// ---------- main ----------
async function main() {
  console.log('== SEED: iniciando ==');
  const dataset = loadDataset();
  console.log(`Dataset: ${dataset.length} exercícios`);
  loadCache();
  initSupabase();

  // 1) MuscleGroups (body_parts distintos)
  const bodyParts = [...new Set(dataset.map((e) => e.body_part))];
  const groupIdByName: Record<string, string> = {};
  for (const bp of bodyParts) {
    const g = await prisma.muscleGroup.upsert({
      where: { name: bp },
      update: { displayName: BODY_PART_PT[bp] ?? bp },
      create: { name: bp, displayName: BODY_PART_PT[bp] ?? bp },
    });
    groupIdByName[bp] = g.id;
  }
  console.log(`MuscleGroups: ${bodyParts.length}`);

  // 2) Exercises (com tradução + mídia)
  const idByExternal: Record<string, string> = {};
  let count = 0;
  for (const e of dataset) {
    const en = e.instructions?.en ?? '';
    const pt = await translatePt(e.id, en);
    const gifUrl = await resolveMedia(e.gif_url);
    const thumbnailUrl = await resolveMedia(e.image);

    const saved = await prisma.exercise.upsert({
      where: { externalId: e.id },
      update: {
        name: e.name,
        target: e.target,
        bodyPart: e.body_part,
        equipment: e.equipment,
        instructions: pt ?? en,
        instructionsEn: en,
        attribution: e.attribution ?? null,
        gifUrl,
        thumbnailUrl,
        muscleGroupId: groupIdByName[e.body_part],
      },
      create: {
        externalId: e.id,
        name: e.name,
        target: e.target,
        bodyPart: e.body_part,
        equipment: e.equipment,
        instructions: pt ?? en,
        instructionsEn: en,
        attribution: e.attribution ?? null,
        gifUrl,
        thumbnailUrl,
        muscleGroupId: groupIdByName[e.body_part],
      },
    });
    idByExternal[e.id] = saved.id;

    if (++count % 100 === 0) {
      console.log(`  exercícios: ${count}/${dataset.length}`);
      if (TRANSLATION_PROVIDER !== 'none') saveCache();
    }
  }
  if (TRANSLATION_PROVIDER !== 'none') saveCache();
  console.log(`Exercises: ${count}`);

  // 3) ExerciseAlternatives (mesmo target+bodyPart, equipamento diferente, cap)
  const groups: Record<string, RawExercise[]> = {};
  for (const e of dataset) {
    const key = `${e.target}|${e.body_part}`;
    (groups[key] ??= []).push(e);
  }

  const altRows: { baseExerciseId: string; altExerciseId: string }[] = [];
  for (const list of Object.values(groups)) {
    for (const base of list) {
      const seenEquip = new Set<string>([base.equipment]);
      const picks: RawExercise[] = [];
      for (const cand of list) {
        if (cand.id === base.id) continue;
        if (cand.equipment === base.equipment) continue;
        // prioriza diversidade de equipamento
        if (!seenEquip.has(cand.equipment)) {
          seenEquip.add(cand.equipment);
          picks.push(cand);
        }
        if (picks.length >= MAX_ALTERNATIVES) break;
      }
      // completa com mesmo-equip-diferente se sobrar espaço
      if (picks.length < MAX_ALTERNATIVES) {
        for (const cand of list) {
          if (cand.id === base.id) continue;
          if (cand.equipment === base.equipment) continue;
          if (picks.find((p) => p.id === cand.id)) continue;
          picks.push(cand);
          if (picks.length >= MAX_ALTERNATIVES) break;
        }
      }
      for (const alt of picks) {
        altRows.push({
          baseExerciseId: idByExternal[base.id],
          altExerciseId: idByExternal[alt.id],
        });
      }
    }
  }
  // limpa e recria (idempotente)
  await prisma.exerciseAlternative.deleteMany({});
  for (let i = 0; i < altRows.length; i += 1000) {
    await prisma.exerciseAlternative.createMany({
      data: altRows.slice(i, i + 1000),
      skipDuplicates: true,
    });
  }
  console.log(`ExerciseAlternatives: ${altRows.length}`);

  // 4) Usuários — reconciliado por syncUsers (upsert por nome + remove extras).
  //    Os 3 usuários e seus PINs ficam em prisma/seed-users.ts.
  await syncUsers(prisma);

  console.log('== SEED: concluído ==');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
