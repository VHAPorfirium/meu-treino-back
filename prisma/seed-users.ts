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
  username: string;
  role: Role;
  pin: string;
}

function resolveSeedPin(envName: string, devFallback: string): string {
  const value = process.env[envName]?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `FATAL DE SEGURANÇA: defina ${envName} no ambiente antes de rodar o seed em produção.`,
    );
  }
  return devFallback;
}

export function resolveSeedUsers(): SeedUser[] {
  return [
    { name: 'Admin', username: 'admin', role: Role.ADMIN, pin: resolveSeedPin('ADMIN_PIN', '9841') },
    { name: 'Victor Hugo', username: 'victor.hugo', role: Role.TRAINEE, pin: resolveSeedPin('VICTOR_PIN', '5823') },
    { name: 'Ninfa', username: 'ninfa', role: Role.TRAINEE, pin: resolveSeedPin('NINFA_PIN', '7194') },
  ];
}

/**
 * Reconcilia os usuários base de forma NÃO-DESTRUTIVA (upsert por username):
 *  - preserva histórico e preserva alunos criados posteriormente pelo painel (`POST /api/users`).
 *  - só remove usuários extras se `SEED_PRUNE_USERS=true` for informado explicitamente.
 */
export async function syncUsers(prisma: PrismaClient): Promise<void> {
  const users = resolveSeedUsers();

  for (const u of users) {
    const pinHash = await argon2.hash(u.pin);
    await prisma.user.upsert({
      where: { username: u.username },
      update: { name: u.name, role: u.role, pinHash },
      create: { name: u.name, username: u.username, role: u.role, pinHash },
    });
    console.log(`✓ ${u.name} (@${u.username}, ${u.role})`);
  }

  if (process.env.SEED_PRUNE_USERS === 'true') {
    const keep = users.map((u) => u.username);
    const extras = await prisma.user.findMany({
      where: { username: { notIn: keep } },
      select: { id: true, name: true },
    });
    if (extras.length) {
      const ids = extras.map((e) => e.id);
      await prisma.trainerNote.deleteMany({ where: { fromId: { in: ids } } });
      await prisma.workoutLog.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      console.log(`- removidos (SEED_PRUNE_USERS=true): ${extras.map((e) => e.name).join(', ')}`);
    }
  }
}

// Execução direta (npm run seed:users) — não roda quando importado pelo seed.ts.
if (require.main === module) {
  const prisma = new PrismaClient();
  syncUsers(prisma)
    .then(async () => {
      const total = await prisma.user.count();
      console.log(`\nUsuários no banco: ${total}`);
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
