-- ─────────────────────────────────────────────────────────────────────────────
-- E11 — tradução pt-BR do catálogo.
--
-- Colunas NOVAS, nullable: o inglês continua intacto porque três coisas dependem
-- dele (o modo TIME sugerido por bodyPart='cardio', o casamento de alternativas
-- por target+bodyPart, e a idempotência do seed contra o dataset). A leitura faz
-- fallback pt -> inglês, igual ao par instructions/instructionsEn que já existia.
--
-- Idempotente, pelo mesmo motivo das anteriores.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Exercise" ADD COLUMN IF NOT EXISTS "namePt" TEXT;
ALTER TABLE "Exercise" ADD COLUMN IF NOT EXISTS "targetPt" TEXT;
ALTER TABLE "Exercise" ADD COLUMN IF NOT EXISTS "equipmentPt" TEXT;

-- a lista usa `namePt` quando existe e cai no `name` quando não; este índice
-- serve a ordenação alfabética da primeira chave
CREATE INDEX IF NOT EXISTS "Exercise_namePt_idx" ON "Exercise"("namePt");
