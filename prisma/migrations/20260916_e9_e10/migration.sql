-- ─────────────────────────────────────────────────────────────────────────────
-- E9 — uma sessão por treino por DIA LOCAL  ·  E10 — exercício medido em tempo
--
-- Escrita de forma defensiva (IF NOT EXISTS / DO $$) pelo mesmo motivo da
-- `20260915_ensure_frente_b_e`: se esta migration for reaplicada, ou constar
-- como aplicada sem ter rodado, rodar de novo não pode quebrar nem perder dado.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── E10: modo do exercício ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExerciseMode') THEN
    CREATE TYPE "ExerciseMode" AS ENUM ('REPS', 'TIME');
  END IF;
END $$;

ALTER TABLE "WorkoutExercise" ADD COLUMN IF NOT EXISTS "mode" "ExerciseMode" NOT NULL DEFAULT 'REPS';
ALTER TABLE "WorkoutExercise" ADD COLUMN IF NOT EXISTS "durationSeconds" INTEGER;

-- `reps` passa a ser opcional: num exercício por tempo ele não existe.
-- Toda linha atual continua com o valor que já tinha (o DEFAULT 'REPS' acima
-- garante que nenhum exercício existente muda de comportamento).
ALTER TABLE "WorkoutExercise" ALTER COLUMN "reps" DROP NOT NULL;

ALTER TABLE "SetLog" ADD COLUMN IF NOT EXISTS "durationSeconds" INTEGER;
ALTER TABLE "WorkoutExerciseLog" ADD COLUMN IF NOT EXISTS "totalSeconds" INTEGER;

-- ── E9: dia local da sessão ──────────────────────────────────────────────────
ALTER TABLE "WorkoutLog" ADD COLUMN IF NOT EXISTS "dayKey" TEXT;

-- Backfill. `date` é gravado pelo Prisma como timestamp SEM fuso, em UTC; por isso
-- o `AT TIME ZONE 'UTC'` primeiro (naive -> instante) e só então a conversão pro
-- fuso do app. Sem esse par, uma sessão das 22h viraria o dia seguinte.
UPDATE "WorkoutLog"
   SET "dayKey" = to_char(("date" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
 WHERE "dayKey" IS NULL;

-- Se já existirem sessões duplicadas do mesmo dia (exatamente o bug que o E9
-- corrige), mantém a mais completa e remove as outras — senão o índice único
-- abaixo falharia e derrubaria o deploy. Critério: mais exercícios registrados,
-- depois concluída, depois a mais antiga.
WITH contagem AS (
  SELECT wl.id, wl."userId", wl."workoutId", wl."dayKey", wl.completed, wl."date",
         (SELECT count(*) FROM "WorkoutExerciseLog" wel WHERE wel."workoutLogId" = wl.id) AS n
    FROM "WorkoutLog" wl
), ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "userId", "workoutId", "dayKey"
           ORDER BY n DESC, completed DESC, "date" ASC
         ) AS rn
    FROM contagem
)
DELETE FROM "WorkoutLog" WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE "WorkoutLog" ALTER COLUMN "dayKey" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "WorkoutLog_userId_workoutId_dayKey_key"
  ON "WorkoutLog"("userId", "workoutId", "dayKey");
