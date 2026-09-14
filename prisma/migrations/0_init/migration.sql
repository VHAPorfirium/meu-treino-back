-- CreateEnum
CREATE TYPE "ExerciseStatus" AS ENUM ('DONE', 'SKIPPED', 'REPLACED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TRAINEE');

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "bodyPart" TEXT NOT NULL,
    "gifUrl" TEXT,
    "thumbnailUrl" TEXT,
    "equipment" TEXT,
    "instructions" TEXT,
    "instructionsEn" TEXT,
    "attribution" TEXT,
    "muscleGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseAlternative" (
    "id" TEXT NOT NULL,
    "baseExerciseId" TEXT NOT NULL,
    "altExerciseId" TEXT NOT NULL,

    CONSTRAINT "ExerciseAlternative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuscleGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,

    CONSTRAINT "MuscleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "pinHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workout" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutExercise" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" TEXT NOT NULL,
    "restSeconds" INTEGER,
    "notes" TEXT,

    CONSTRAINT "WorkoutExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutExerciseLog" (
    "id" TEXT NOT NULL,
    "workoutLogId" TEXT NOT NULL,
    "workoutExerciseId" TEXT NOT NULL,
    "status" "ExerciseStatus" NOT NULL,
    "actualExerciseId" TEXT,
    "loadUsed" DOUBLE PRECISION,
    "setsCompleted" INTEGER,
    "note" TEXT,

    CONSTRAINT "WorkoutExerciseLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutLog" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkoutLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_externalId_key" ON "Exercise"("externalId" ASC);

-- CreateIndex
CREATE INDEX "Exercise_muscleGroupId_idx" ON "Exercise"("muscleGroupId" ASC);

-- CreateIndex
CREATE INDEX "Exercise_target_bodyPart_idx" ON "Exercise"("target" ASC, "bodyPart" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseAlternative_baseExerciseId_altExerciseId_key" ON "ExerciseAlternative"("baseExerciseId" ASC, "altExerciseId" ASC);

-- CreateIndex
CREATE INDEX "ExerciseAlternative_baseExerciseId_idx" ON "ExerciseAlternative"("baseExerciseId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MuscleGroup_name_key" ON "MuscleGroup"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name" ASC);

-- CreateIndex
CREATE INDEX "WorkoutExercise_workoutId_idx" ON "WorkoutExercise"("workoutId" ASC);

-- CreateIndex
CREATE INDEX "WorkoutExerciseLog_workoutLogId_idx" ON "WorkoutExerciseLog"("workoutLogId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutExerciseLog_workoutLogId_workoutExerciseId_key" ON "WorkoutExerciseLog"("workoutLogId" ASC, "workoutExerciseId" ASC);

-- CreateIndex
CREATE INDEX "WorkoutLog_userId_date_idx" ON "WorkoutLog"("userId" ASC, "date" ASC);

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_muscleGroupId_fkey" FOREIGN KEY ("muscleGroupId") REFERENCES "MuscleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAlternative" ADD CONSTRAINT "ExerciseAlternative_altExerciseId_fkey" FOREIGN KEY ("altExerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAlternative" ADD CONSTRAINT "ExerciseAlternative_baseExerciseId_fkey" FOREIGN KEY ("baseExerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExerciseLog" ADD CONSTRAINT "WorkoutExerciseLog_actualExerciseId_fkey" FOREIGN KEY ("actualExerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExerciseLog" ADD CONSTRAINT "WorkoutExerciseLog_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "WorkoutExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExerciseLog" ADD CONSTRAINT "WorkoutExerciseLog_workoutLogId_fkey" FOREIGN KEY ("workoutLogId") REFERENCES "WorkoutLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

