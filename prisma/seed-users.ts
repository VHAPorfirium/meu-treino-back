/**
 * Usuários base do app e rotina que reconcilia o banco em desenvolvimento/staging.
 *
 * Rode direto pra (re)criar SÓ os usuários base, sem mexer no catálogo:
 *   npm run seed:users
 *
 * Em produção, defina as senhas/PINs via variáveis de ambiente
 * (`ADMIN_PIN`, `VICTOR_PERSONAL_PASSWORD`, `VICTOR_PIN`, `NINFA_PIN`).
 */
import { LinkStatus, PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

export interface SeedUser {
  name: string;
  username: string;
  role: Role;
  pin: string;
}

function resolveSeedSecret(envName: string, devFallback: string): string {
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
    {
      name: 'Admin',
      username: 'admin',
      role: Role.ADMIN,
      pin: resolveSeedSecret('ADMIN_PIN', 'Admin@2026'),
    },
    {
      name: 'Victor Personal',
      username: 'victor.personal',
      role: Role.PERSONAL,
      pin: resolveSeedSecret('VICTOR_PERSONAL_PASSWORD', 'Personal@2026'),
    },
    {
      name: 'Victor Hugo',
      username: 'victor.hugo',
      role: Role.TRAINEE,
      pin: resolveSeedSecret('VICTOR_PIN', 'Aluno@2026'),
    },
    {
      name: 'Ninfa',
      username: 'ninfa',
      role: Role.TRAINEE,
      pin: resolveSeedSecret('NINFA_PIN', 'Aluna@2026'),
    },
  ];
}

/**
 * Reconcilia os usuários base de forma NÃO-DESTRUTIVA (upsert por username)
 * e garante vínculos iniciais ACTIVE de `victor.personal` com `victor.hugo` e `ninfa`.
 */
export async function syncUsers(prisma: PrismaClient): Promise<void> {
  const users = resolveSeedUsers();
  const byUsername = new Map<string, string>();

  for (const u of users) {
    const pinHash = await argon2.hash(u.pin, { type: argon2.argon2id });
    const record = await prisma.user.upsert({
      where: { username: u.username },
      update: { name: u.name, role: u.role, pinHash },
      create: { name: u.name, username: u.username, role: u.role, pinHash },
    });
    byUsername.set(u.username, record.id);
    console.log(`✓ ${u.name} (@${u.username}, ${u.role})`);
  }

  const trainerId = byUsername.get('victor.personal');
  if (trainerId) {
    for (const traineeUsername of ['victor.hugo', 'ninfa']) {
      const traineeId = byUsername.get(traineeUsername);
      if (!traineeId) continue;
      const existingActive = await prisma.trainerTraineeLink.findFirst({
        where: { traineeId, status: LinkStatus.ACTIVE },
      });
      if (!existingActive) {
        await prisma.trainerTraineeLink.create({
          data: {
            trainerId,
            traineeId,
            status: LinkStatus.ACTIVE,
            respondedAt: new Date(),
          },
        });
        console.log(`✓ vínculo ACTIVE: @victor.personal → @${traineeUsername}`);
      }
    }
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
      console.log(
        `- removidos (SEED_PRUNE_USERS=true): ${extras.map((e) => e.name).join(', ')}`,
      );
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
