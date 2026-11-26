-- Fase 2 (v2.0.0) — Parte 2: multi-personal, CPF único por papel (permite PERSONAL + TRAINEE
-- com o mesmo CPF), vínculos TrainerTraineeLink, ownership/portabilidade e isolamento de fotos/recados.
-- Idempotente e segura para bancos já populados na v1.1.0.

-- 1. Evoluir unicidade do CPF para (cpfHash, role) + índice para busca O(1)
DROP INDEX IF EXISTS "User_cpfHash_key";
CREATE UNIQUE INDEX IF NOT EXISTS "User_cpfHash_role_key" ON "User"("cpfHash", "role");
CREATE INDEX IF NOT EXISTS "User_cpfHash_idx" ON "User"("cpfHash");

-- 2. Novos enums para ciclo de vida do vínculo Personal ↔ Aluno
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LinkStatus') THEN
    CREATE TYPE "LinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'ENDED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LinkEndReason') THEN
    CREATE TYPE "LinkEndReason" AS ENUM (
      'TRAINER_DEACTIVATED',
      'TRAINEE_ENDED',
      'TRAINER_ENDED',
      'TRAINER_CANCELLED'
    );
  END IF;
END $$;

-- 3. Tabela TrainerTraineeLink
CREATE TABLE IF NOT EXISTS "TrainerTraineeLink" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "status" "LinkStatus" NOT NULL DEFAULT 'PENDING',
    "endedReason" "LinkEndReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "TrainerTraineeLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrainerTraineeLink_trainerId_status_idx" ON "TrainerTraineeLink"("trainerId", "status");
CREATE INDEX IF NOT EXISTS "TrainerTraineeLink_traineeId_status_idx" ON "TrainerTraineeLink"("traineeId", "status");
CREATE INDEX IF NOT EXISTS "TrainerTraineeLink_trainerId_traineeId_idx" ON "TrainerTraineeLink"("trainerId", "traineeId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrainerTraineeLink_trainerId_fkey') THEN
    ALTER TABLE "TrainerTraineeLink"
      ADD CONSTRAINT "TrainerTraineeLink_trainerId_fkey"
      FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrainerTraineeLink_traineeId_fkey') THEN
    ALTER TABLE "TrainerTraineeLink"
      ADD CONSTRAINT "TrainerTraineeLink_traineeId_fkey"
      FOREIGN KEY ("traineeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. Ownership e portabilidade em Workout e TrainingProgram
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "ownerTrainerId" TEXT;
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "clonedFromId" TEXT;
CREATE INDEX IF NOT EXISTS "Workout_ownerTrainerId_idx" ON "Workout"("ownerTrainerId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Workout_ownerTrainerId_fkey') THEN
    ALTER TABLE "Workout"
      ADD CONSTRAINT "Workout_ownerTrainerId_fkey"
      FOREIGN KEY ("ownerTrainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "TrainingProgram" ADD COLUMN IF NOT EXISTS "ownerTrainerId" TEXT;
ALTER TABLE "TrainingProgram" ADD COLUMN IF NOT EXISTS "clonedFromId" TEXT;
CREATE INDEX IF NOT EXISTS "TrainingProgram_ownerTrainerId_idx" ON "TrainingProgram"("ownerTrainerId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrainingProgram_ownerTrainerId_fkey') THEN
    ALTER TABLE "TrainingProgram"
      ADD CONSTRAINT "TrainingProgram_ownerTrainerId_fkey"
      FOREIGN KEY ("ownerTrainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Continuidade de progresso de desafios após Copy-on-Transfer (WorkoutLog.programAssignmentId)
ALTER TABLE "WorkoutLog" ADD COLUMN IF NOT EXISTS "programAssignmentId" TEXT;
CREATE INDEX IF NOT EXISTS "WorkoutLog_programAssignmentId_idx" ON "WorkoutLog"("programAssignmentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkoutLog_programAssignmentId_fkey') THEN
    ALTER TABLE "WorkoutLog"
      ADD CONSTRAINT "WorkoutLog_programAssignmentId_fkey"
      FOREIGN KEY ("programAssignmentId") REFERENCES "ProgramAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 6. Isolamento de fotos de progresso e recados por vínculo (ProgressPhoto / TrainerNote)
ALTER TABLE "ProgressPhoto" ADD COLUMN IF NOT EXISTS "trainerLinkId" TEXT;
CREATE INDEX IF NOT EXISTS "ProgressPhoto_trainerLinkId_idx" ON "ProgressPhoto"("trainerLinkId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProgressPhoto_trainerLinkId_fkey') THEN
    ALTER TABLE "ProgressPhoto"
      ADD CONSTRAINT "ProgressPhoto_trainerLinkId_fkey"
      FOREIGN KEY ("trainerLinkId") REFERENCES "TrainerTraineeLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "TrainerNote" ADD COLUMN IF NOT EXISTS "trainerLinkId" TEXT;
CREATE INDEX IF NOT EXISTS "TrainerNote_trainerLinkId_idx" ON "TrainerNote"("trainerLinkId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrainerNote_trainerLinkId_fkey') THEN
    ALTER TABLE "TrainerNote"
      ADD CONSTRAINT "TrainerNote_trainerLinkId_fkey"
      FOREIGN KEY ("trainerLinkId") REFERENCES "TrainerTraineeLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 7. Backfill idempotente para ambiente já populado (v1.x -> v2.0):
--    - Só executa quando já existem alunos (TRAINEE) cadastrados (mantém bancos novos/CI limpos).
--    - Cria o primeiro personal `victor.personal` (caso ainda não exista).
--    - Atribui ownership dos treinos e programas legados a `victor.personal`.
--    - Cria vínculos ACTIVE entre `victor.personal` e os alunos legados (Ninfa e Victor).
--    - Vincula fotos, recados e logs de programas existentes aos vínculos/assignments ativos.
DO $$
DECLARE
  v_trainer_id TEXT;
  v_trainee RECORD;
  v_link_id TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "role" = 'TRAINEE') THEN
    SELECT "id" INTO v_trainer_id
    FROM "User"
    WHERE "username" = 'victor.personal'
    LIMIT 1;

    IF v_trainer_id IS NULL THEN
      v_trainer_id := 'u_victor_personal_v2';
      INSERT INTO "User" (
        "id", "name", "username", "role", "pinHash", "active", "mustChangePassword", "createdAt"
      ) VALUES (
        v_trainer_id,
        'Victor Personal',
        'victor.personal',
        'PERSONAL',
        '$argon2id$v=19$m=65536,t=3,p=4$dBlUjXAfZw0nWHjJQeI9JQ$R30/AC+wC/1VpgGB0uh/pORX07NaJ9oPL2G5E5IR+kk',
        true,
        false,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("username") DO NOTHING;

      SELECT "id" INTO v_trainer_id
      FROM "User"
      WHERE "username" = 'victor.personal'
      LIMIT 1;
    END IF;

    IF v_trainer_id IS NOT NULL THEN
      -- Ownership dos treinos e programas legados
      UPDATE "Workout"
      SET "ownerTrainerId" = v_trainer_id
      WHERE "ownerTrainerId" IS NULL;

      UPDATE "TrainingProgram"
      SET "ownerTrainerId" = v_trainer_id
      WHERE "ownerTrainerId" IS NULL;

      -- Vincula alunos existentes (Ninfa e Victor) ao `victor.personal` caso ainda sem vínculo ativo
      FOR v_trainee IN
        SELECT "id"
        FROM "User"
        WHERE "role" = 'TRAINEE'
          AND (
            LOWER("username") IN ('ninfa', 'victor', 'victor.hugo')
            OR LOWER("name") LIKE '%ninfa%'
            OR LOWER("name") LIKE '%victor%'
          )
      LOOP
        SELECT "id" INTO v_link_id
        FROM "TrainerTraineeLink"
        WHERE "traineeId" = v_trainee."id" AND "status" = 'ACTIVE'
        LIMIT 1;

        IF v_link_id IS NULL THEN
          v_link_id := 'lnk_init_' || SUBSTRING(MD5(v_trainer_id || ':' || v_trainee."id"), 1, 20);
          INSERT INTO "TrainerTraineeLink" (
            "id", "trainerId", "traineeId", "status", "createdAt", "respondedAt"
          ) VALUES (
            v_link_id, v_trainer_id, v_trainee."id", 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          );
        END IF;

        -- Preserva fotos e recados legados dentro do vínculo inicial com `victor.personal`
        UPDATE "ProgressPhoto"
        SET "trainerLinkId" = v_link_id
        WHERE "userId" = v_trainee."id" AND "trainerLinkId" IS NULL;

        UPDATE "TrainerNote"
        SET "trainerLinkId" = v_link_id,
            "fromId" = CASE
              WHEN "fromId" IN (SELECT "id" FROM "User" WHERE "role" = 'ADMIN') THEN v_trainer_id
              ELSE "fromId"
            END
        WHERE "toId" = v_trainee."id" AND "trainerLinkId" IS NULL;
      END LOOP;

      -- Backfill de WorkoutLog.programAssignmentId para preservar progresso de desafios ativos
      UPDATE "WorkoutLog" wl
      SET "programAssignmentId" = pa."id"
      FROM "Workout" w
      INNER JOIN "ProgramAssignment" pa
        ON pa."programId" = w."programId"
      WHERE wl."workoutId" = w."id"
        AND pa."userId" = wl."userId"
        AND pa."status" = 'ACTIVE'
        AND wl."programAssignmentId" IS NULL
        AND wl."dayKey" >= pa."startDayKey";
    END IF;
  END IF;
END $$;
