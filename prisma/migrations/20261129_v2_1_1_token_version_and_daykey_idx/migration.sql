-- v2.1.1 — Hardening de segurança (User.tokenVersion para revogação imediata de JWT)
-- e índice WorkoutLog.dayKey para consultas agregadas do painel /admin sem full scan.
-- Idempotente e 100% compatível com bancos existentes (tokenVersion nasce em 0).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "WorkoutLog_dayKey_idx" ON "WorkoutLog"("dayKey");
