/**
 * Smoke test de migrations e schema contra PostgreSQL real (usado no CI em toda PR).
 *
 * Verifica:
 *  1. Conexão e tabela `_prisma_migrations` sem migrations pendentes/falhas.
 *  2. Presença de todas as tabelas e índices críticos esperados pelo `schema.prisma`.
 *  3. Fluxo relacional completo (4 papéis, CPF compartilhado entre PERSONAL e TRAINEE,
 *     rejeição de CPF duplicado no mesmo papel, TrainerTraineeLink, ownership/portabilidade,
 *     isolamento de fotos/recados, SQL raw e unicidade de `ProgressPhoto.path`) em transação
 *     com rollback ao final — sem deixar resíduos no banco.
 */
import {
  ExerciseMode,
  ExerciseStatus,
  LinkStatus,
  Prisma,
  PrismaClient,
  ProgramStatus,
  ProgramType,
  Role,
} from '@prisma/client';

const EXPECTED_TABLES = [
  'User',
  'TrainerTraineeLink',
  'MuscleGroup',
  'Exercise',
  'ExerciseAlternative',
  'Workout',
  'WorkoutExercise',
  'WorkoutLog',
  'WorkoutExerciseLog',
  'WorkoutAssignment',
  'SetLog',
  'ProgressPhoto',
  'TrainerNote',
  'PushSubscription',
  'TrainingProgram',
  'ProgramAssignment',
  'FavoriteExercise',
  'AccessLog',
] as const;

const EXPECTED_INDEXES = [
  'User_username_key',
  'User_cpfHash_role_key',
  'User_cpfHash_idx',
  'TrainerTraineeLink_trainerId_status_idx',
  'TrainerTraineeLink_traineeId_status_idx',
  'Exercise_namePt_idx',
  'ProgressPhoto_path_key',
  'WorkoutLog_userId_workoutId_dayKey_key',
  'WorkoutAssignment_workoutId_userId_key',
  'FavoriteExercise_userId_exerciseId_key',
] as const;

class SmokeRollback extends Error {
  constructor() {
    super('SMOKE_ROLLBACK');
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Smoke check falhou: ${message}`);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    // 1. Conectividade e estado das migrations
    await prisma.$queryRaw`SELECT 1`;
    const migrations = await prisma.$queryRaw<
      { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
    >`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC`;

    assert(migrations.length > 0, 'nenhuma migration registrada em _prisma_migrations');
    const broken = migrations.filter((m) => !m.finished_at || m.rolled_back_at);
    assert(
      broken.length === 0,
      `migrations incompletas/revertidas: ${broken.map((m) => m.migration_name).join(', ')}`,
    );

    // 2. Tabelas e índices críticos no catálogo do Postgres
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
    const tableSet = new Set(tables.map((t) => t.table_name));
    const missingTables = EXPECTED_TABLES.filter((t) => !tableSet.has(t));
    assert(missingTables.length === 0, `tabelas ausentes: ${missingTables.join(', ')}`);

    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `;
    const indexSet = new Set(indexes.map((i) => i.indexname));
    const missingIndexes = EXPECTED_INDEXES.filter((idx) => !indexSet.has(idx));
    assert(missingIndexes.length === 0, `índices ausentes: ${missingIndexes.join(', ')}`);

    // 3. Round-trip relacional + SQL raw em transação com rollback garantido
    try {
      await prisma.$transaction(async (tx) => {
        const suffix = `smoke-${Date.now()}`;
        const sharedCpfHash = `cpf-dual-${suffix}`;

        const admin = await tx.user.create({
          data: {
            name: `Admin ${suffix}`,
            username: `admin.${suffix}`,
            cpfHash: `cpf-admin-${suffix}`,
            cpfEncrypted: 'v1:enc',
            role: Role.ADMIN,
            pinHash: 'hash-admin',
            active: true,
            mustChangePassword: false,
          },
        });
        await tx.user.create({
          data: {
            name: `Portaria ${suffix}`,
            username: `portaria.${suffix}`,
            cpfHash: `cpf-rec-${suffix}`,
            cpfEncrypted: 'v1:enc-rec',
            role: Role.RECEPTION,
            pinHash: 'hash-rec',
            active: true,
            mustChangePassword: false,
          },
        });
        // Mesma pessoa com perfil PERSONAL e TRAINEE usando o MESMO cpfHash!
        const personal = await tx.user.create({
          data: {
            name: `Personal ${suffix}`,
            username: `personal.${suffix}`,
            cpfHash: sharedCpfHash,
            cpfEncrypted: 'v1:enc-pers',
            role: Role.PERSONAL,
            pinHash: 'hash-personal',
            active: true,
            mustChangePassword: false,
          },
        });
        const trainee = await tx.user.create({
          data: {
            name: `Aluno ${suffix}`,
            username: `aluno.${suffix}`,
            cpfHash: sharedCpfHash,
            cpfEncrypted: 'v1:enc-trainee',
            role: Role.TRAINEE,
            pinHash: 'hash-trainee',
            active: true,
            mustChangePassword: true,
          },
        });

        // Garante que duplicar o MESMO (cpfHash, role) continua bloqueado com P2002
        await tx.$executeRawUnsafe('SAVEPOINT sp_cpf_role_unique');
        let dupCpfSameRoleRejected = false;
        try {
          await tx.user.create({
            data: {
              name: `Aluno Dup ${suffix}`,
              username: `aluno.dup.${suffix}`,
              cpfHash: sharedCpfHash,
              role: Role.TRAINEE,
              pinHash: 'hash',
            },
          });
        } catch (err) {
          if ((err as { code?: unknown } | null)?.code === 'P2002') {
            dupCpfSameRoleRejected = true;
          }
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT sp_cpf_role_unique');
        }
        assert(
          dupCpfSameRoleRejected,
          'User(cpfHash, role) deveria rejeitar duplicata no mesmo papel com P2002',
        );

        const link = await tx.trainerTraineeLink.create({
          data: {
            trainerId: personal.id,
            traineeId: trainee.id,
            status: LinkStatus.ACTIVE,
            respondedAt: new Date(),
          },
        });

        await tx.accessLog.create({
          data: {
            event: 'auth.login.success',
            userId: trainee.id,
            actorUserId: admin.id,
            identifierMasked: '***.982.247-**',
            ip: '127.0.0.1',
            statusCode: 200,
          },
        });

        // Valida lock determinístico usado em PrismaProgramRepository e Links
        const locked = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join([trainee.id])}) ORDER BY "id" FOR UPDATE`,
        );
        assert(locked.length === 1 && locked[0].id === trainee.id, 'SELECT FOR UPDATE em User');

        const group = await tx.muscleGroup.create({
          data: { name: `chest-${suffix}`, displayName: 'Peito' },
        });
        const exercise = await tx.exercise.create({
          data: {
            externalId: `ext-${suffix}`,
            name: 'Bench Press',
            namePt: 'Supino Reto',
            target: 'pectorals',
            targetPt: 'Peitoral',
            bodyPart: 'chest',
            equipment: 'barbell',
            equipmentPt: 'Barra',
            muscleGroupId: group.id,
          },
        });
        const altExercise = await tx.exercise.create({
          data: {
            externalId: `ext-alt-${suffix}`,
            name: 'Dumbbell Press',
            namePt: 'Supino com Halteres',
            target: 'pectorals',
            bodyPart: 'chest',
            muscleGroupId: group.id,
          },
        });
        await tx.exerciseAlternative.create({
          data: { baseExerciseId: exercise.id, altExerciseId: altExercise.id },
        });

        const program = await tx.trainingProgram.create({
          data: {
            name: `Desafio ${suffix}`,
            type: ProgramType.CHALLENGE,
            targetDays: 30,
            ownerTrainerId: personal.id,
          },
        });
        const workout = await tx.workout.create({
          data: {
            name: `Treino A ${suffix}`,
            dayOfWeek: 1,
            active: true,
            programId: program.id,
            ownerTrainerId: personal.id,
          },
        });
        const weReps = await tx.workoutExercise.create({
          data: {
            workoutId: workout.id,
            exerciseId: exercise.id,
            order: 1,
            mode: ExerciseMode.REPS,
            sets: 3,
            reps: '10',
            restSeconds: 60,
          },
        });
        await tx.workoutExercise.create({
          data: {
            workoutId: workout.id,
            exerciseId: altExercise.id,
            order: 2,
            mode: ExerciseMode.TIME,
            sets: 1,
            reps: null,
            durationSeconds: 900,
          },
        });

        await tx.workoutAssignment.create({
          data: { workoutId: workout.id, userId: trainee.id },
        });
        const assignment = await tx.programAssignment.create({
          data: {
            programId: program.id,
            userId: trainee.id,
            startDayKey: '2026-11-20',
            status: ProgramStatus.ACTIVE,
          },
        });

        const log = await tx.workoutLog.create({
          data: {
            workoutId: workout.id,
            userId: trainee.id,
            dayKey: '2026-11-25',
            completed: true,
            programAssignmentId: assignment.id,
          },
        });
        const exLog = await tx.workoutExerciseLog.create({
          data: {
            workoutLogId: log.id,
            workoutExerciseId: weReps.id,
            status: ExerciseStatus.DONE,
            loadUsed: 42.5,
            setsCompleted: 3,
            totalSeconds: null,
          },
        });
        await tx.setLog.create({
          data: {
            workoutExerciseLogId: exLog.id,
            setNumber: 1,
            weight: 42.5,
            reps: 10,
          },
        });

        // Valida a query raw `SELECT DISTINCT ON` de PrismaWorkoutLogRepository.findLastPerformances
        const lastPerfIds = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`
            SELECT DISTINCT ON (COALESCE(wel."actualExerciseId", we."exerciseId"))
              wel."id"
            FROM "WorkoutExerciseLog" wel
            INNER JOIN "WorkoutLog" wl ON wl."id" = wel."workoutLogId"
            INNER JOIN "WorkoutExercise" we ON we."id" = wel."workoutExerciseId"
            WHERE wl."userId" = ${trainee.id}
              AND wl."dayKey" < ${'2026-11-26'}
              AND wel."status" IN ('DONE', 'REPLACED')
              AND COALESCE(wel."actualExerciseId", we."exerciseId") IN (${Prisma.join([exercise.id])})
            ORDER BY COALESCE(wel."actualExerciseId", we."exerciseId"), wl."date" DESC
          `,
        );
        assert(
          lastPerfIds.length === 1 && lastPerfIds[0].id === exLog.id,
          'SELECT DISTINCT ON em findLastPerformances',
        );

        await tx.trainerNote.create({
          data: {
            fromId: personal.id,
            toId: trainee.id,
            text: 'Bom treino!',
            trainerLinkId: link.id,
          },
        });
        await tx.pushSubscription.create({
          data: {
            userId: trainee.id,
            endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`,
            p256dh: 'p256dh-test',
            auth: 'auth-test',
          },
        });
        await tx.favoriteExercise.create({
          data: { userId: trainee.id, exerciseId: exercise.id },
        });

        const photoPath = `${trainee.id}/${suffix}.jpg`;
        await tx.progressPhoto.create({
          data: { userId: trainee.id, path: photoPath, trainerLinkId: link.id },
        });

        // Valida constraint @unique em ProgressPhoto.path via SAVEPOINT
        await tx.$executeRawUnsafe('SAVEPOINT sp_photo_unique');
        let duplicateRejected = false;
        try {
          await tx.progressPhoto.create({
            data: { userId: trainee.id, path: photoPath },
          });
        } catch (err) {
          const code = (err as { code?: unknown } | null)?.code;
          if (code === 'P2002') duplicateRejected = true;
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT sp_photo_unique');
        }
        assert(duplicateRejected, 'ProgressPhoto.path deveria rejeitar duplicata com P2002');

        throw new SmokeRollback();
      });
    } catch (err) {
      if (!(err instanceof SmokeRollback)) throw err;
    }

    // eslint-disable-next-line no-console
    console.log(
      `✔ Smoke check OK: ${migrations.length} migrations aplicadas, ${EXPECTED_TABLES.length} tabelas, ${EXPECTED_INDEXES.length} índices críticos e fluxo relacional validados.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
