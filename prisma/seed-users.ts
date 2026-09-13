/**
 * Usuários do app (login por PIN) e a rotina que reconcilia o banco.
 *
 * Rode direto pra (re)criar SÓ os usuários, sem mexer no catálogo:
 *   npm run seed:users
 *
 * PINs podem vir do ambiente (ADMIN_PIN / VICTOR_PIN / NINFA_PIN); senão
 * usam o padrão abaixo. Como o login é por PIN, os PINs precisam ser únicos.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

export interface SeedUser {
  name: string;
  role: Role;
  pin: string;
}

export const USERS: SeedUser[] = [
  { name: 'Admin', role: Role.ADMIN, pin: process.env.ADMIN_PIN ?? '0000' },
  { name: 'Victor Hugo', role: Role.TRAINEE, pin: process.env.VICTOR_PIN ?? '1009' },
  { name: 'Ninfa', role: Role.TRAINEE, pin: process.env.NINFA_PIN ?? '3003' },
];

/**
 * Deixa o banco com EXATAMENTE os usuários de `USERS`:
 *  - upsert por nome (preserva o histórico de quem permanece);
 *  - remove qualquer usuário fora da lista, junto com os logs dele.
 */
export async function syncUsers(prisma: PrismaClient): Promise<void> {
  const pins = USERS.map((u) => u.pin);
  if (new Set(pins).size !== pins.length) {
    throw new Error(
      'PINs duplicados — cada usuário precisa de um PIN único (login é por PIN).',
    );
  }

  for (const u of USERS) {
    const pinHash = await argon2.hash(u.pin);
    await prisma.user.upsert({
      where: { name: u.name },
      update: { role: u.role, pinHash },
      create: { name: u.name, role: u.role, pinHash },
    });
    console.log(`✓ ${u.name} (${u.role})`);
  }

  const keep = USERS.map((u) => u.name);
  const extras = await prisma.user.findMany({
    where: { name: { notIn: keep } },
    select: { id: true, name: true },
  });
  if (extras.length) {
    const ids = extras.map((e) => e.id);
    // WorkoutExerciseLog cai em cascata ao apagar o WorkoutLog.
    await prisma.workoutLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`- removidos: ${extras.map((e) => e.name).join(', ')}`);
  }
}

// Execução direta (npm run seed:users) — não roda quando importado pelo seed.ts.
if (require.main === module) {
  const prisma = new PrismaClient();
  syncUsers(prisma)
    .then(async () => {
      const total = await prisma.user.count();
      console.log(`\nUsuários no banco: ${total} (esperado: ${USERS.length})`);
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
