import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../shared/auth/public.decorator';
import { PrismaService } from '../../shared/prisma/prisma.service';

/** Tabelas que o schema.prisma exige. Faltar qualquer uma = 500 na rota que a usa. */
const TABELAS_ESPERADAS = [
  'User',
  'MuscleGroup',
  'Exercise',
  'ExerciseAlternative',
  'Workout',
  'WorkoutExercise',
  'WorkoutLog',
  'WorkoutExerciseLog',
  // Frente B/E
  'WorkoutAssignment',
  'SetLog',
  'ProgressPhoto',
  'TrainerNote',
  'PushSubscription',
] as const;

type Passo = { ok: boolean; code?: string; error?: string };

function falha(e: unknown): Passo {
  const err = e as { code?: string; name?: string; message?: string };
  return {
    ok: false,
    code: err?.code,
    // mensagem do Prisma é sobre schema, não sobre dado do usuário
    error: `${err?.name ?? 'Error'}: ${(err?.message ?? String(e)).slice(0, 300)}`,
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /api/health — healthcheck simples (Render/monitoração).
  @Public()
  @SkipThrottle()
  @Get()
  check() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  /**
   * GET /api/health/db — diagnóstico de schema.
   *
   * Existe porque um 500 opaco em produção custou um ciclo inteiro de deploy pra
   * ser diagnosticado: `migrate deploy` pode marcar uma migration como aplicada
   * sem ter criado as tabelas, e aí só quebra no primeiro SELECT que as toca.
   * Aqui dá pra ver, sem abrir log de servidor: o que o banco tem, o que a
   * migration registrou e em qual passo exatamente `GET /workouts` falharia.
   *
   * Não devolve nenhum dado de usuário — só nomes de tabela, contagens e códigos
   * de erro do Prisma.
   */
  @Public()
  @SkipThrottle()
  @Get('db')
  async db() {
    const out: Record<string, unknown> = { ts: new Date().toISOString() };

    // 1) tabelas presentes no schema corrente
    let presentes: string[] = [];
    try {
      const rows = await this.prisma.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
      `;
      presentes = rows.map((r) => r.table_name);
      out.connection = { ok: true };
    } catch (e) {
      return { ...out, connection: falha(e) };
    }

    out.missingTables = TABELAS_ESPERADAS.filter((t) => !presentes.includes(t));
    out.tableCount = presentes.length;

    // 2) o que o Prisma registrou como aplicado
    try {
      const migs = await this.prisma.$queryRaw<
        { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
      >`
        SELECT migration_name, finished_at, rolled_back_at
        FROM "_prisma_migrations" ORDER BY started_at ASC
      `;
      out.migrations = migs.map((m) => ({
        name: m.migration_name,
        applied: Boolean(m.finished_at),
        rolledBack: Boolean(m.rolled_back_at),
      }));
    } catch (e) {
      out.migrations = falha(e);
    }

    // 3) reproduz, passo a passo, exatamente o que GET /api/workouts faz
    const listAll: Record<string, Passo | number> = {};
    let ids: string[] = [];
    try {
      const rows = await this.prisma.workout.findMany({
        orderBy: [{ active: 'desc' }, { dayOfWeek: 'asc' }, { createdAt: 'desc' }],
        include: { _count: { select: { exercises: true } } },
      });
      ids = rows.map((w) => w.id);
      listAll.step1_workouts = { ok: true };
      listAll.workoutCount = rows.length;
    } catch (e) {
      listAll.step1_workouts = falha(e);
    }
    try {
      const a = await this.prisma.workoutAssignment.findMany({
        where: { workoutId: { in: ids } },
        include: { user: { select: { id: true, name: true } } },
      });
      listAll.step2_assignments = { ok: true };
      listAll.assignmentCount = a.length;
    } catch (e) {
      listAll.step2_assignments = falha(e);
    }
    out.listAll = listAll;

    const okGeral =
      (out.missingTables as string[]).length === 0 &&
      (listAll.step1_workouts as Passo).ok &&
      (listAll.step2_assignments as Passo).ok;

    return { status: okGeral ? 'ok' : 'degraded', ...out };
  }
}
