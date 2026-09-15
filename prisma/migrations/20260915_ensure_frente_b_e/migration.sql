-- ─────────────────────────────────────────────────────────────────────────────
-- Rede de segurança da Frente B/E.
--
-- Por que existe: a migration `20260914_frente_b_e` pode constar como aplicada
-- em `_prisma_migrations` sem que o DDL tenha rodado de fato (baseline manual,
-- `migrate resolve --applied`, banco recriado a partir de dump antigo). Quando
-- isso acontece o app sobe normalmente e só quebra no primeiro SELECT que toca
-- a tabela ausente — foi o 500 do `GET /api/workouts`.
--
-- Esta migration é 100% idempotente: se as tabelas/índices/FKs já existem ela
-- não faz nada; se faltam, cria. Rodar de novo nunca destrói dado.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tabelas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "WorkoutAssignment" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SetLog" (
    "id" TEXT NOT NULL,
    "workoutExerciseLogId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION,
    "reps" INTEGER,

    CONSTRAINT "SetLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProgressPhoto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ProgressPhoto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TrainerNote" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- ── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "WorkoutAssignment_userId_idx" ON "WorkoutAssignment"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkoutAssignment_workoutId_userId_key" ON "WorkoutAssignment"("workoutId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "SetLog_workoutExerciseLogId_setNumber_key" ON "SetLog"("workoutExerciseLogId", "setNumber");
CREATE INDEX IF NOT EXISTS "ProgressPhoto_userId_takenAt_idx" ON "ProgressPhoto"("userId", "takenAt");
CREATE INDEX IF NOT EXISTS "TrainerNote_toId_createdAt_idx" ON "TrainerNote"("toId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
-- Postgres não tem "ADD CONSTRAINT IF NOT EXISTS"; o DO $$ abaixo faz o papel.
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('WorkoutAssignment_workoutId_fkey', 'WorkoutAssignment', '"workoutId"', 'Workout',            'CASCADE'),
      ('WorkoutAssignment_userId_fkey',    'WorkoutAssignment', '"userId"',    'User',               'CASCADE'),
      ('SetLog_workoutExerciseLogId_fkey', 'SetLog',            '"workoutExerciseLogId"', 'WorkoutExerciseLog', 'CASCADE'),
      ('ProgressPhoto_userId_fkey',        'ProgressPhoto',     '"userId"',    'User',               'CASCADE'),
      ('TrainerNote_fromId_fkey',          'TrainerNote',       '"fromId"',    'User',               'RESTRICT'),
      ('TrainerNote_toId_fkey',            'TrainerNote',       '"toId"',      'User',               'CASCADE'),
      ('PushSubscription_userId_fkey',     'PushSubscription',  '"userId"',    'User',               'CASCADE')
    ) AS t(nome, tabela, coluna, alvo, on_delete)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.conname = fk.nome AND n.nspname = current_schema()
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES %I("id") ON DELETE %s ON UPDATE CASCADE',
        fk.tabela, fk.nome, fk.coluna, fk.alvo, fk.on_delete
      );
    END IF;
  END LOOP;
END $$;
