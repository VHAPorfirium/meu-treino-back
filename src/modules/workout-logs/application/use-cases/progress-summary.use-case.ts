import { Inject, Injectable } from '@nestjs/common';
import { ExerciseStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';
import { CacheService, TTL } from '../../../../shared/cache/cache.service';

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (d: Date) => new Date(d).toISOString().slice(0, 10);

function weekKey(d: Date): string {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7; // segunda = início
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class ProgressSummaryUseCase {
  constructor(
    @Inject(WORKOUT_LOG_REPOSITORY)
    private readonly repo: WorkoutLogRepository,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Chave do cache. O `userId` aqui é **sobre quem** é o resumo, não quem
   * perguntou — a rota é ADMIN-only e dois admins veem exatamente a mesma coisa.
   * Mesmo assim vai por `lembrarDoUsuario`: é o que amarra a entrada ao aluno e
   * faz a invalidação das escritas DELE limparem o resumo certo.
   */
  static chave(userId?: string) {
    return { dono: userId ?? 'all', nome: 'progress:v1' };
  }

  /**
   * @param userId quando informado, restringe o resumo a um aluno. Sem ele, o
   * resumo é **agregado**: soma as sessões de todos os alunos. Nesse modo,
   * `streak` e `heatmap` passam a significar "dias em que alguém treinou", não
   * a constância de uma pessoa — o front avisa isso na tela.
   */
  execute(userId?: string) {
    const { dono, nome } = ProgressSummaryUseCase.chave(userId);
    return this.cache.lembrarDoUsuario(dono, nome, TTL.PROGRESSO, () =>
      this.calcular(userId),
    );
  }

  private async calcular(userId?: string) {
    const now = new Date();
    const since90 = new Date(now.getTime() - 90 * DAY);
    const since30 = new Date(now.getTime() - 30 * DAY);
    const since60 = new Date(now.getTime() - 60 * DAY);

    const logs = await this.prisma.workoutLog.findMany({
      where: { date: { gte: since90 }, ...(userId ? { userId } : {}) },
      orderBy: { date: 'asc' },
      include: {
        exerciseLogs: {
          include: {
            workoutExercise: { include: { exercise: true } },
            actualExercise: { select: { id: true, name: true } },
          },
        },
      },
    });

    const inRange = (d: Date, from: Date, to: Date) =>
      new Date(d) >= from && new Date(d) < to;

    // ---------- frequência ----------
    const completed = logs.filter((l) => l.completed);
    const last30days = completed.filter((l) =>
      inRange(l.date, since30, now),
    ).length;
    const prev30 = completed.filter((l) =>
      inRange(l.date, since60, since30),
    ).length;

    const byWeekMap: Record<string, number> = {};
    for (const l of completed) {
      if (new Date(l.date) < new Date(now.getTime() - 56 * DAY)) continue;
      const k = weekKey(l.date);
      byWeekMap[k] = (byWeekMap[k] ?? 0) + 1;
    }
    const byWeek = Object.entries(byWeekMap)
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // ---------- aderência (DONE / total marcados) ----------
    const logs30 = logs.filter((l) => inRange(l.date, since30, now));
    const logs60 = logs.filter((l) => inRange(l.date, since60, since30));
    const adher = (list: typeof logs) => {
      let done = 0;
      let total = 0;
      for (const l of list)
        for (const e of l.exerciseLogs) {
          total++;
          if (e.status === ExerciseStatus.DONE) done++;
        }
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    };
    const a30 = adher(logs30);
    const a60 = adher(logs60);
    const adherence = {
      pct: a30.pct,
      completedExercises: a30.done,
      totalExercises: a30.total,
      deltaPp: a30.pct - a60.pct,
    };

    // ---------- sequência (streak de dias com sessão completa) ----------
    const doneDays = new Set<string>(completed.map((l) => dayKey(l.date)));
    let current = 0;
    for (let i = 0; ; i++) {
      const d = dayKey(new Date(now.getTime() - i * DAY));
      if (doneDays.has(d)) current++;
      else if (i === 0) continue; // hoje ainda pode não ter treinado
      else break;
    }
    let best = 0;
    let run = 0;
    const sortedDays = [...doneDays].sort();
    for (let i = 0; i < sortedDays.length; i++) {
      if (
        i > 0 &&
        new Date(sortedDays[i]).getTime() -
          new Date(sortedDays[i - 1]).getTime() ===
          DAY
      )
        run++;
      else run = 1;
      best = Math.max(best, run);
    }
    const streak = { current, best };

    // ---------- carga total (volume somado, 30d vs 30d anterior) ----------
    const volume = (list: typeof logs) => {
      let v = 0;
      for (const l of list)
        for (const e of l.exerciseLogs)
          if (e.loadUsed) v += e.loadUsed * (e.setsCompleted ?? 1);
      return v;
    };
    const v30 = volume(logs30);
    const v60 = volume(logs60);
    const cargaTotal = {
      current: Math.round(v30),
      deltaPct: v60 ? Math.round(((v30 - v60) / v60) * 100) : 0,
    };

    // ---------- cardio: minutos (E10) ----------
    // Volume (`cargaTotal`) é peso × séries, então cardio entra como zero e some
    // da conta — correto, mas deixaria o trabalho aeróbico invisível. Aqui ele
    // ganha a própria métrica: soma dos `totalSeconds` registrados.
    const segundosCardio = (list: typeof logs) => {
      let t = 0;
      for (const l of list)
        for (const e of l.exerciseLogs) t += e.totalSeconds ?? 0;
      return t;
    };
    const c30 = segundosCardio(logs30);
    const c60 = segundosCardio(logs60);
    const cardio = {
      minutes: Math.round(c30 / 60),
      deltaPct: c60 ? Math.round(((c30 - c60) / c60) * 100) : 0,
    };

    // ---------- heatmap 30 dias ----------
    const dayStatus: Record<string, number> = {};
    for (const l of logs) {
      if (!inRange(l.date, since30, new Date(now.getTime() + DAY))) continue;
      const k = dayKey(l.date);
      const level = l.completed ? 3 : 2; // completo = verde, aberto/parcial = âmbar
      dayStatus[k] = Math.max(dayStatus[k] ?? 0, level);
    }
    const heatmap: { date: string; level: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const k = dayKey(new Date(now.getTime() - i * DAY));
      heatmap.push({ date: k, level: dayStatus[k] ?? 0 });
    }

    // ---------- exercise logs (analytics) ----------
    const skipped: Record<string, number> = {};
    const replaced: Record<string, number> = {};
    const loadByExercise: Record<string, { date: string; loadUsed: number }[]> =
      {};
    const notes: { text: string; exercise: string; date: string }[] = [];

    for (const l of logs) {
      for (const e of l.exerciseLogs) {
        const baseName = e.workoutExercise?.exercise?.name ?? '—';
        if (e.status === ExerciseStatus.SKIPPED)
          skipped[baseName] = (skipped[baseName] ?? 0) + 1;
        if (e.status === ExerciseStatus.REPLACED) {
          const toName = e.actualExercise?.name ?? '—';
          replaced[`${baseName} → ${toName}`] =
            (replaced[`${baseName} → ${toName}`] ?? 0) + 1;
        }
        if (e.loadUsed != null) {
          const eff =
            e.status === ExerciseStatus.REPLACED && e.actualExercise
              ? e.actualExercise.name
              : baseName;
          (loadByExercise[eff] ??= []).push({
            date: dayKey(l.date),
            loadUsed: e.loadUsed,
          });
        }
        if (e.note)
          notes.push({
            text: e.note,
            exercise: baseName,
            date: dayKey(l.date),
          });
      }
    }

    const mostSkipped = Object.entries(skipped)
      .map(([exercise, count]) => ({ exercise, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const mostReplaced = Object.entries(replaced)
      .map(([pair, count]) => {
        const [from, to] = pair.split(' → ');
        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const loadProgression = Object.entries(loadByExercise).map(
      ([exercise, points]) => ({ exercise, points }),
    );

    // ranking combinado (pulados + trocados) p/ o dashboard
    const swapByBase: Record<string, number> = {};
    for (const r of mostReplaced)
      swapByBase[r.from] = (swapByBase[r.from] ?? 0) + r.count;
    const ranking = [
      ...mostSkipped.map((s) => ({
        name: s.exercise,
        type: 'skip' as const,
        count: s.count,
      })),
      ...Object.entries(swapByBase).map(([name, count]) => ({
        name,
        type: 'swap' as const,
        count,
      })),
    ]
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const recentNotes = notes
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);

    return {
      // --- campos usados pelo dashboard (design) ---
      sessions: { last30days, delta: last30days - prev30, target: 16 },
      adherence,
      streak,
      cargaTotal,
      cardio,
      heatmap,
      ranking,
      recentNotes,
      // --- campos mantidos (evolução) ---
      frequency: { last30days, byWeek },
      mostSkipped,
      mostReplaced,
      loadProgression,
    };
  }
}
