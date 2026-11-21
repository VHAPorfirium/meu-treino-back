-- ─────────────────────────────────────────────────────────────────────────────
-- Programas: treino contínuo, mesociclo e desafio com prazo.
--
-- TrainingProgram é o "modelo" (nome, tipo, duração, treinos). ProgramAssignment
-- é a participação de cada aluno, com o próprio "Dia 1", status e relatório.
-- Workout.programId é opcional: treinos sem programa continuam funcionando
-- exatamente como antes.
--
-- Idempotente, pelo mesmo motivo das anteriores.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ProgramType" AS ENUM ('CONTINUOUS', 'MESOCYCLE', 'CHALLENGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProgramStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "TrainingProgram" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "type"        "ProgramType" NOT NULL DEFAULT 'CONTINUOUS',
  "targetWeeks" INTEGER,
  "targetDays"  INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProgramAssignment" (
  "id"          TEXT NOT NULL,
  "programId"   TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "startDayKey" TEXT NOT NULL,
  "startDate"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endDate"     TIMESTAMP(3),
  "status"      "ProgramStatus" NOT NULL DEFAULT 'ACTIVE',
  "reportData"  JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgramAssignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "programId" TEXT;

CREATE INDEX IF NOT EXISTS "Workout_programId_idx" ON "Workout"("programId");
CREATE INDEX IF NOT EXISTS "ProgramAssignment_userId_status_idx" ON "ProgramAssignment"("userId", "status");
CREATE INDEX IF NOT EXISTS "ProgramAssignment_programId_idx" ON "ProgramAssignment"("programId");

DO $$ BEGIN
  ALTER TABLE "Workout" ADD CONSTRAINT "Workout_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "TrainingProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "TrainingProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
