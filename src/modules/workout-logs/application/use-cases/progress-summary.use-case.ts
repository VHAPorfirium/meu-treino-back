import { Inject, Injectable } from '@nestjs/common';
import { ExerciseStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  WORKOUT_LOG_REPOSITORY,
  WorkoutLogRepository,
} from '../../domain/workout-log.repository';
import { CacheService, TTL } from '../../../../shared/cache/cache.service';
import {
  diaLocal,
  inicioDaSemanaLocal,
  somarDias,
} from '../../../../shared/time/dia-local';

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

  async calcular(userId?: string, now: Date = new Date()) {
    const todayKey = diaLocal(now);
    const since90Key = somarDias(todayKey, -90);
    const since56Key = somarDias(todayKey, -55);
    const since30Key = somarDias(todayKey, -29); // últimos 30 dias locais (incluindo hoje)
    const since60Key = somarDias(todayKey, -59); // janela de 30 dias locais imediatamente anterior

    const logs = await this.prisma.workoutLog.findMany({
      where: { dayKey: { gte: since90Key }, ...(userId ? { userId } : {}) },
      orderBy: [{ dayKey: 'asc' }, { date: 'asc' }],
      include: {
        exerciseLogs: {
          include: {
            workoutExercise: {
              select: {
                exercise: { select: { id: true, name: true, namePt: true } },
              },
            },
            actualExercise: { select: { id: true, name: true, namePt: true } },
          },
        },
      },
    });

    const logDay = (l: (typeof logs)[number]) => l.dayKey || diaLocal(l.date);
    const inDayRange = (k: string, fromKey: string, toInclusiveKey: string) =>
      k >= fromKey && k <= toInclusiveKey;
    const prev30EndKey = somarDias(since30Key, -1);

    // ---------- frequência ----------
    const completed = logs.filter((l) => l.completed);
    const last30days = completed.filter((l) =>
      inDayRange(logDay(l), since30Key, todayKey),
    ).length;
    const prev30 = completed.filter((l) =>
      inDayRange(logDay(l), since60Key, prev30EndKey),
    ).length;

    const byWeekMap: Record<string, number> = {};
    for (const l of completed) {
      const d = logDay(l);
      if (d < since56Key) continue;
      const k = inicioDaSemanaLocal(d);
      byWeekMap[k] = (byWeekMap[k] ?? 0) + 1;
    }
    const byWeek = Object.entries(byWeekMap)
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // ---------- aderência (DONE / total marcados) ----------
    const logs30 = logs.filter((l) => inDayRange(logDay(l), since30Key, todayKey));
    const logs60 = logs.filter((l) => inDayRange(logDay(l), since60Key, prev30EndKey));
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

    // ---------- sequência (streak de dias locais com sessão completa) ----------
    const doneDays = new Set<string>(completed.map(logDay));
    let current = 0;
    for (let i = 0; i <= doneDays.size + 1; i++) {
      const d = somarDias(todayKey, -i);
      if (doneDays.has(d)) current++;
      else if (i === 0) continue; // hoje ainda pode não ter treinado
      else break;
    }
    let best = 0;
    let run = 0;
    const sortedDays = [...doneDays].sort();
    for (let i = 0; i < sortedDays.length; i++) {
      if (i > 0 && somarDias(sortedDays[i - 1], 1) === sortedDays[i]) run++;
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

    // ---------- heatmap 30 dias locais ----------
    const dayStatus: Record<string, number> = {};
    for (const l of logs) {
      const k = logDay(l);
      if (!inDayRange(k, since30Key, todayKey)) continue;
      const level = l.completed ? 3 : 2; // completo = verde, aberto/parcial = âmbar
      dayStatus[k] = Math.max(dayStatus[k] ?? 0, level);
    }
    const heatmap: { date: string; level: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const k = somarDias(todayKey, -i);
      heatmap.push({ date: k, level: dayStatus[k] ?? 0 });
    }

    // ---------- exercise logs (analytics) ----------
    const skipped: Record<string, number> = {};
    const replaced: Record<string, number> = {};
    const loadByExercise: Record<string, { date: string; loadUsed: number }[]> =
      {};
    const notes: { text: string; exercise: string; date: string }[] = [];

    for (const l of logs) {
      const k = logDay(l);
      for (const e of l.exerciseLogs) {
        const baseEx = e.workoutExercise?.exercise;
        const baseName = baseEx?.namePt || baseEx?.name || '—';
        if (e.status === ExerciseStatus.SKIPPED)
          skipped[baseName] = (skipped[baseName] ?? 0) + 1;
        if (e.status === ExerciseStatus.REPLACED) {
          const toName = e.actualExercise?.namePt || e.actualExercise?.name || '—';
          replaced[`${baseName} → ${toName}`] =
            (replaced[`${baseName} → ${toName}`] ?? 0) + 1;
        }
        if (e.loadUsed != null) {
          const eff =
            e.status === ExerciseStatus.REPLACED && e.actualExercise
              ? e.actualExercise.namePt || e.actualExercise.name
              : baseName;
          (loadByExercise[eff] ??= []).push({
            date: k,
            loadUsed: e.loadUsed,
          });
        }
        if (e.note)
          notes.push({
            text: e.note,
            exercise: baseName,
            date: k,
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
