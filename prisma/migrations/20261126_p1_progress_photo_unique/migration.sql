-- ─────────────────────────────────────────────────────────────────────────────
-- P1 — unicidade de `ProgressPhoto.path`.
--
-- Impede registrar a mesma imagem do Supabase Storage duas vezes (antes,
-- apagar uma cópia removia o arquivo compartilhado no bucket).
-- Idempotente: remove eventuais duplicatas mantendo o registro mais antigo
-- antes de criar o índice único.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM "ProgressPhoto" a
USING "ProgressPhoto" b
WHERE a."path" = b."path"
  AND (
    a."takenAt" > b."takenAt"
    OR (a."takenAt" = b."takenAt" AND a."id" > b."id")
  );

CREATE UNIQUE INDEX IF NOT EXISTS "ProgressPhoto_path_key" ON "ProgressPhoto"("path");
