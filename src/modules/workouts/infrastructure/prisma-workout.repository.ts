import { Injectable, Logger } from '@nestjs/common';
import { Workout, WorkoutExercise } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  AssigneeSummary,
  WorkoutExerciseData,
  WorkoutRepository,
  WorkoutWithExercises,
} from '../domain/workout.repository';

/** include padrão de um treino "completo" (exercícios ordenados + destinatários). */
const FULL_INCLUDE = {
  exercises: { include: { exercise: true }, orderBy: { order: 'asc' as const } },
  assignments: { include: { user: { select: { id: true, name: true } } } },
};

/** mesmo include, sem os destinatários — usado quando `WorkoutAssignment` não existe. */
const INCLUDE_SEM_ASSIGNMENTS = {
  exercises: { include: { exercise: true }, orderBy: { order: 'asc' as const } },
};

/**
 * P2021 = tabela não existe · P2022 = coluna não existe.
 * São os dois erros de *drift de schema*: o Prisma Client conhece o modelo, o banco
 * não tem a tabela. Só eles entram no fallback — qualquer outro erro continua subindo.
 */
function ehDriftDeSchema(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === 'P2021' || code === 'P2022';
}

@Injectable()
export class PrismaWorkoutRepository implements WorkoutRepository {
  private readonly log = new Logger(PrismaWorkoutRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executa uma consulta que depende de `WorkoutAssignment`. Se a tabela não existir
   * no banco (drift de migration), loga em ERROR e devolve `fallback` em vez de
   * derrubar a requisição inteira com 500.
   *
   * Isso é rede de segurança, não correção: o schema é garantido pela migration
   * `20260915_ensure_frente_b_e`, e `GET /api/health/db` mostra se falta alguma tabela.
   */
  private async comAssignments<T>(
    onde: string,
    consulta: () => Promise<T>,
    fallback: () => T | Promise<T>,
  ): Promise<T> {
    try {
      return await consulta();
    } catch (e) {
      if (!ehDriftDeSchema(e)) throw e;
      this.log.error(
        `[${onde}] tabela WorkoutAssignment indisponível (${(e as { code?: string }).code}) — ` +
          `respondendo sem destinatários. Rode as migrations: veja GET /api/health/db.`,
      );
      return fallback();
    }
  }

  // ── criação / leitura ──────────────────────────────────────────────────────

  create(data: {
    name: string;
    dayOfWeek?: number;
    active?: boolean;
  }): Promise<Workout> {
    return this.prisma.workout.create({
      data: {
        name: data.name,
        dayOfWeek: data.dayOfWeek,
        active: data.active ?? true,
      },
    });
  }

  addExercise(
    workoutId: string,
    data: WorkoutExerciseData,
  ): Promise<WorkoutExercise> {
    return this.prisma.workoutExercise.create({
      data: { workoutId, ...data },
    });
  }

  findById(id: string): Promise<Workout | null> {
    return this.prisma.workout.findUnique({ where: { id } });
  }

  /**
   * Lista os treinos com contagem de exercícios e destinatários.
   *
   * Duas consultas simples em vez de um `include` aninhado junto com `_count`:
   * é mais previsível sob o pooler (pgbouncer) e, com zero treinos, nem chega a
   * tocar em `WorkoutAssignment` — a tela do admin abre mesmo num banco recém-criado.
   */
  async listAll(): Promise<any[]> {
    const rows = await this.prisma.workout.findMany({
      orderBy: [{ active: 'desc' }, { dayOfWeek: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { exercises: true } } },
    });
    if (rows.length === 0) return [];

    const assignments = await this.comAssignments(
      'listAll',
      () =>
        this.prisma.workoutAssignment.findMany({
          where: { workoutId: { in: rows.map((w) => w.id) } },
          include: { user: { select: { id: true, name: true } } },
        }),
      () => [],
    );

    const porTreino = new Map<string, { id: string; name: string }[]>();
    for (const a of assignments) {
      const lista = porTreino.get(a.workoutId) ?? [];
      lista.push(a.user);
      porTreino.set(a.workoutId, lista);
    }

    return rows.map((w) => ({ ...w, assignees: porTreino.get(w.id) ?? [] }));
  }

  findByIdWithExercises(id: string): Promise<WorkoutWithExercises | null> {
    return this.comAssignments(
      'findByIdWithExercises',
      () =>
        this.prisma.workout.findUnique({
          where: { id },
          include: FULL_INCLUDE,
        }),
      async () => {
        const w = await this.prisma.workout.findUnique({
          where: { id },
          include: INCLUDE_SEM_ASSIGNMENTS,
        });
        return w
          ? ({ ...w, assignments: [] } as unknown as WorkoutWithExercises)
          : null;
      },
    );
  }

  async findAlternativesForExercises(exerciseIds: string[]) {
    if (exerciseIds.length === 0) return {};
    const rows = await this.prisma.exerciseAlternative.findMany({
      where: { baseExerciseId: { in: exerciseIds } },
      include: {
        alt: {
          select: {
            id: true,
            name: true,
            equipment: true,
            gifUrl: true,
            thumbnailUrl: true,
          },
        },
      },
      orderBy: { alt: { name: 'asc' } },
    });

    const map: Record<string, (typeof rows)[number]['alt'][]> = {};
    for (const r of rows) {
      (map[r.baseExerciseId] ??= []).push(r.alt);
    }
    return map;
  }

  // ── E1: CRUD ───────────────────────────────────────────────────────────────

  update(
    id: string,
    data: { name?: string; dayOfWeek?: number | null; active?: boolean },
  ): Promise<Workout> {
    return this.prisma.workout.update({ where: { id }, data });
  }

  countLogs(workoutId: string): Promise<number> {
    return this.prisma.workoutLog.count({ where: { workoutId } });
  }

  async delete(id: string): Promise<void> {
    // exercícios e assignments caem em cascata (schema)
    await this.prisma.workout.delete({ where: { id } });
  }

  findExerciseInWorkout(
    workoutId: string,
    workoutExerciseId: string,
  ): Promise<WorkoutExercise | null> {
    return this.prisma.workoutExercise.findFirst({
      where: { id: workoutExerciseId, workoutId },
    });
  }

  updateExercise(
    workoutExerciseId: string,
    data: {
      sets?: number;
      reps?: string;
      restSeconds?: number | null;
      notes?: string | null;
    },
  ): Promise<WorkoutExercise> {
    return this.prisma.workoutExercise.update({
      where: { id: workoutExerciseId },
      data,
    });
  }

  countExerciseLogs(workoutExerciseId: string): Promise<number> {
    return this.prisma.workoutExerciseLog.count({
      where: { workoutExerciseId },
    });
  }

  async removeExerciseAndReindex(
    workoutId: string,
    workoutExerciseId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.workoutExercise.delete({ where: { id: workoutExerciseId } });
      const rest = await tx.workoutExercise.findMany({
        where: { workoutId },
        orderBy: { order: 'asc' },
        select: { id: true },
      });
      // `order` é 1-based no projeto (AddExerciseDto exige >= 1)
      await Promise.all(
        rest.map((we, i) =>
          tx.workoutExercise.update({ where: { id: we.id }, data: { order: i + 1 } }),
        ),
      );
    });
  }

  // ── E1.1: direcionamento ───────────────────────────────────────────────────

  async setAssignees(
    workoutId: string,
    userIds: string[],
  ): Promise<AssigneeSummary[]> {
    const unique = Array.from(new Set(userIds));
    await this.prisma.$transaction(async (tx) => {
      await tx.workoutAssignment.deleteMany({
        where: { workoutId, userId: { notIn: unique } },
      });
      if (unique.length) {
        await tx.workoutAssignment.createMany({
          data: unique.map((userId) => ({ workoutId, userId })),
          skipDuplicates: true,
        });
      }
    });
    const rows = await this.prisma.workoutAssignment.findMany({
      where: { workoutId },
      include: { user: { select: { id: true, name: true } } },
    });
    return rows.map((r) => r.user);
  }

  findAssignedActiveByDay(
    userId: string,
    dayOfWeek: number,
  ): Promise<WorkoutWithExercises | null> {
    return this.comAssignments(
      'findAssignedActiveByDay',
      () =>
        this.prisma.workout.findFirst({
          where: { active: true, dayOfWeek, assignments: { some: { userId } } },
          include: FULL_INCLUDE,
          orderBy: { createdAt: 'desc' },
        }),
      () => null,
    );
  }

  findFirstAssignedActive(userId: string): Promise<WorkoutWithExercises | null> {
    return this.comAssignments(
      'findFirstAssignedActive',
      () =>
        this.prisma.workout.findFirst({
          where: { active: true, assignments: { some: { userId } } },
          include: FULL_INCLUDE,
          orderBy: { createdAt: 'desc' },
        }),
      () => null,
    );
  }

  listAssigned(userId: string): Promise<any[]> {
    return this.comAssignments(
      'listAssigned',
      () =>
        this.prisma.workout.findMany({
          where: { assignments: { some: { userId } } },
          orderBy: [{ active: 'desc' }, { dayOfWeek: 'asc' }, { createdAt: 'desc' }],
          include: { _count: { select: { exercises: true } } },
        }),
      () => [],
    );
  }

  // ── E2: reordenar / duplicar ───────────────────────────────────────────────

  async reorder(
    workoutId: string,
    items: { workoutExerciseId: string; order: number }[],
  ): Promise<void> {
    await this.prisma.$transaction(
      items.map((it) =>
        this.prisma.workoutExercise.update({
          where: { id: it.workoutExerciseId },
          data: { order: it.order },
        }),
      ),
    );
  }

  async duplicate(
    id: string,
    opts: { name: string; copyAssignees: boolean },
  ): Promise<Workout> {
    return this.prisma.$transaction(async (tx) => {
      const src = await tx.workout.findUniqueOrThrow({
        where: { id },
        include: { exercises: true, assignments: true },
      });
      const copy = await tx.workout.create({
        data: { name: opts.name, dayOfWeek: null, active: true },
      });
      if (src.exercises.length) {
        await tx.workoutExercise.createMany({
          data: src.exercises.map((we) => ({
            workoutId: copy.id,
            exerciseId: we.exerciseId,
            order: we.order,
            sets: we.sets,
            reps: we.reps,
            restSeconds: we.restSeconds,
            notes: we.notes,
          })),
        });
      }
      if (opts.copyAssignees && src.assignments.length) {
        await tx.workoutAssignment.createMany({
          data: src.assignments.map((a) => ({
            workoutId: copy.id,
            userId: a.userId,
          })),
        });
      }
      return copy;
    });
  }
}
