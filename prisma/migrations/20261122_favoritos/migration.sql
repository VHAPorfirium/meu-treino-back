-- ─────────────────────────────────────────────────────────────────────────────
-- Favoritos: exercícios marcados com estrela por cada usuário (aluno ou personal).
-- Idempotente, pelo mesmo motivo das anteriores.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "FavoriteExercise" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FavoriteExercise_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FavoriteExercise_userId_exerciseId_key" ON "FavoriteExercise"("userId", "exerciseId");
CREATE INDEX IF NOT EXISTS "FavoriteExercise_userId_idx" ON "FavoriteExercise"("userId");

DO $$ BEGIN
  ALTER TABLE "FavoriteExercise" ADD CONSTRAINT "FavoriteExercise_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FavoriteExercise" ADD CONSTRAINT "FavoriteExercise_exerciseId_fkey"
    FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
