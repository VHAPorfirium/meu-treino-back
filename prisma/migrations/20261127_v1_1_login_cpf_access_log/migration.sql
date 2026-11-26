-- Fase 1 (v1.1.0): Novo login (CPF criptografado + username + senha forte), ciclo de vida (`active`, `mustChangePassword`) e tabela `AccessLog`.
-- Idempotente e segura para bancos já populados na v1.0.x (faz backfill automático de `username` sem colisões).

-- 1. Novas colunas na tabela User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cpfHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "cpfEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill determinístico de `username` para usuários legados (v1.0.x) sem colisão
WITH normalized AS (
  SELECT
    "id",
    COALESCE(
      NULLIF(
        TRIM(BOTH '.' FROM REGEXP_REPLACE(
          REGEXP_REPLACE(
            LOWER(
              TRANSLATE(
                TRIM("name"),
                'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
                'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
              )
            ),
            '[^a-z0-9]+',
            '.',
            'g'
          ),
          '\.{2,}',
          '.',
          'g'
        )),
        ''
      ),
      'usuario'
    ) AS base_slug,
    "createdAt"
  FROM "User"
  WHERE "username" IS NULL OR TRIM("username") = ''
),
ranked AS (
  SELECT
    "id",
    base_slug,
    ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM normalized
)
UPDATE "User" u
SET "username" = CASE
  WHEN r.rn = 1 THEN r.base_slug
  ELSE r.base_slug || r.rn::TEXT
END
FROM ranked r
WHERE u."id" = r."id";

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- 3. Remover unicidade de `User.name` e criar índices únicos em `username` e `cpfHash`
DROP INDEX IF EXISTS "User_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_cpfHash_key" ON "User"("cpfHash");

-- 4. Criar tabela de auditoria de acessos e tentativas (`AccessLog`)
CREATE TABLE IF NOT EXISTS "AccessLog" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "userId" TEXT,
    "actorUserId" TEXT,
    "identifierMasked" TEXT,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "method" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "reason" TEXT,
    "requestId" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccessLog_createdAt_idx" ON "AccessLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AccessLog_event_createdAt_idx" ON "AccessLog"("event", "createdAt");
CREATE INDEX IF NOT EXISTS "AccessLog_userId_createdAt_idx" ON "AccessLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AccessLog_ip_createdAt_idx" ON "AccessLog"("ip", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccessLog_userId_fkey') THEN
    ALTER TABLE "AccessLog"
      ADD CONSTRAINT "AccessLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccessLog_actorUserId_fkey') THEN
    ALTER TABLE "AccessLog"
      ADD CONSTRAINT "AccessLog_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
