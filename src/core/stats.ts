// Statistiques d'un joueur (fonctions pures) : réussite par sous-thème,
// points faibles, évolution des scores.

import { OTHER_LABEL, SUBCATEGORIES } from './categories';
import { FAMILY_LABEL } from './material';
import type { Family } from './types';

export interface AttemptLike {
  t: number;
  m: string;
  r: number;
  c: string;
  f: string;
  ok: boolean;
}

export interface RunLike {
  t: number;
  mode: string;
  theme: string;
  score: number;
  level?: number;
  errors?: number;
  bestCombo?: number;
  /** Elo du puzzle le plus difficile réussi (parties enregistrées depuis la v0.4). */
  highest?: number;
  /** Nombre de puzzles joués (idem). */
  played?: number;
  /** Coups joués par le joueur (depuis la v0.4). */
  moves?: number;
  /** Durée réelle de la partie en ms, du 1er coup à la fin (depuis la v0.4). */
  durationMs?: number;
}

/** Précision façon Lichess : part des coups joués qui n'étaient pas des erreurs. */
export function runAccuracy(r: RunLike): number | null {
  if (!r.moves) return null;
  return Math.max(0, (r.moves - (r.errors ?? 0)) / r.moves);
}

export interface CategoryStat {
  id: string;
  family: string;
  label: string;
  title: string;
  attempts: number;
  success: number;
  /** Taux de réussite 0..1. */
  rate: number;
  /** Elo moyen des puzzles tentés. */
  avgRating: number;
}

export interface StatsFilter {
  mode?: string; // storm | streak | training | undefined = tous
  family?: string; // undefined = toutes
  sinceMs?: number; // horodatage minimal
}

export function filterAttempts<T extends AttemptLike>(attempts: T[], filter: StatsFilter): T[] {
  return attempts.filter(
    (a) =>
      (!filter.mode || a.m === filter.mode) &&
      (!filter.family || a.f === filter.family) &&
      (!filter.sinceMs || a.t >= filter.sinceMs),
  );
}

export function categoryInfo(id: string, family: string): { label: string; title: string } {
  const sub = SUBCATEGORIES.find((s) => s.id === id);
  if (sub) return { label: sub.label, title: sub.title };
  const famLabel = FAMILY_LABEL[family as Family] ?? family;
  const short = famLabel.replace(/^Finales (de )?/, '');
  return { label: `${OTHER_LABEL} (${short})`, title: `${famLabel} — autres configurations` };
}

export function statsByCategory(attempts: AttemptLike[]): CategoryStat[] {
  const map = new Map<string, { family: string; n: number; ok: number; rating: number }>();
  for (const a of attempts) {
    const cur = map.get(a.c) ?? { family: a.f, n: 0, ok: 0, rating: 0 };
    cur.n += 1;
    cur.ok += a.ok ? 1 : 0;
    cur.rating += a.r;
    map.set(a.c, cur);
  }
  return [...map.entries()].map(([id, v]) => ({
    id,
    family: v.family,
    ...categoryInfo(id, v.family),
    attempts: v.n,
    success: v.ok,
    rate: v.ok / v.n,
    avgRating: Math.round(v.rating / v.n),
  }));
}

/**
 * Points faibles : sous-thèmes avec assez de tentatives pour être
 * significatifs, du plus faible au plus fort taux de réussite.
 */
export function weaknesses(stats: CategoryStat[], minAttempts = 5): CategoryStat[] {
  return stats.filter((s) => s.attempts >= minAttempts).sort((a, b) => a.rate - b.rate || b.attempts - a.attempts);
}

export interface Totals {
  attempts: number;
  success: number;
  rate: number;
}

export function totals(attempts: AttemptLike[]): Totals {
  const success = attempts.filter((a) => a.ok).length;
  return { attempts: attempts.length, success, rate: attempts.length ? success / attempts.length : 0 };
}

/** Série des scores d'un mode, dans l'ordre chronologique. */
export function scoreSeries(runs: RunLike[], mode: string, theme?: string): { t: number; score: number }[] {
  return runs
    .filter((r) => r.mode === mode && (!theme || r.theme === theme))
    .sort((a, b) => a.t - b.t)
    .map((r) => ({ t: r.t, score: r.score }));
}

// --- Records façon Lichess : meilleure partie par période, sessions récentes ---

export interface PeriodRecords<R> {
  today: R | null;
  week: R | null;
  month: R | null;
  all: R | null;
}

/** Débuts (ms) du jour, de la semaine (lundi) et du mois civils, heure locale. */
export function periodStarts(now: number): { day: number; week: number; month: number } {
  const d = new Date(now);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const offset = (d.getDay() + 6) % 7; // lundi = 0
  const week = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset).getTime();
  const month = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return { day, week, month };
}

/** Meilleure partie (score le plus haut ; à égalité, la plus ancienne) sur une liste. */
function bestOf<R extends RunLike>(runs: R[]): R | null {
  let best: R | null = null;
  for (const r of runs) if (r.score > 0 && (!best || r.score > best.score || (r.score === best.score && r.t < best.t))) best = r;
  return best;
}

/** Records du jour, de la semaine, du mois et de tous les temps pour un mode. */
export function periodRecords<R extends RunLike>(runs: R[], mode: string, now: number, theme?: string): PeriodRecords<R> {
  const mine = runs.filter((r) => r.mode === mode && (!theme || r.theme === theme));
  const { day, week, month } = periodStarts(now);
  return {
    today: bestOf(mine.filter((r) => r.t >= day)),
    week: bestOf(mine.filter((r) => r.t >= week)),
    month: bestOf(mine.filter((r) => r.t >= month)),
    all: bestOf(mine),
  };
}

/** Sessions d'un mode, de la plus récente à la plus ancienne. */
export function recentRuns<R extends RunLike>(runs: R[], mode: string, limit = 20, theme?: string): R[] {
  return runs
    .filter((r) => r.mode === mode && (!theme || r.theme === theme))
    .sort((a, b) => b.t - a.t)
    .slice(0, limit);
}

// --- Tableau de bord façon Lichess : meilleur essai de chaque jour ---

export interface DailyBest<R> {
  day: number; // début du jour (ms, heure locale)
  best: R;
  count: number; // nombre d'essais ce jour-là
}

export function dailyBest<R extends RunLike>(runs: R[], mode: string, theme?: string): DailyBest<R>[] {
  const map = new Map<number, DailyBest<R>>();
  for (const r of runs) {
    if (r.mode !== mode || (theme && r.theme !== theme)) continue;
    const day = periodStarts(r.t).day;
    const cur = map.get(day);
    if (!cur) map.set(day, { day, best: r, count: 1 });
    else {
      cur.count += 1;
      if (r.score > cur.best.score || (r.score === cur.best.score && r.t < cur.best.t)) cur.best = r;
    }
  }
  return [...map.values()].sort((a, b) => b.day - a.day);
}

// --- Profil par type de finale (radar + classement) ---

export const FAMILY_ORDER = ['pions', 'tours', 'dames', 'fous', 'cavaliers', 'mixte'] as const;

export interface TypeStat {
  id: string;
  family: string;
  label: string;
  title: string;
  attempts: number;
  success: number;
  /** Précision = puzzles réussis / tentés (0..1). */
  rate: number;
  /** Niveau atteint : Elo du puzzle le plus difficile réussi. */
  maxSolved: number | null;
  /** Niveau où l'on bute : Elo moyen des puzzles manqués. */
  avgFailed: number | null;
}

function accumulate(attempts: AttemptLike[], keyOf: (a: AttemptLike) => string) {
  const map = new Map<string, { family: string; n: number; ok: number; max: number | null; failSum: number; fails: number }>();
  for (const a of attempts) {
    const k = keyOf(a);
    const cur = map.get(k) ?? { family: a.f, n: 0, ok: 0, max: null, failSum: 0, fails: 0 };
    cur.n += 1;
    if (a.ok) {
      cur.ok += 1;
      cur.max = cur.max === null ? a.r : Math.max(cur.max, a.r);
    } else {
      cur.fails += 1;
      cur.failSum += a.r;
    }
    map.set(k, cur);
  }
  return map;
}

/**
 * Statistiques par type : `scope` = 'family' (une ligne par famille, toujours
 * les 6 familles, même sans données) ou le nom d'une famille (ses sous-thèmes).
 */
export function typeProfile(attempts: AttemptLike[], scope: string): TypeStat[] {
  const byFamily = scope === 'family';
  const pool = byFamily ? attempts : attempts.filter((a) => a.f === scope);
  const map = accumulate(pool, (a) => (byFamily ? a.f : a.c));
  const ids: string[] = byFamily
    ? [...FAMILY_ORDER]
    : [
        ...SUBCATEGORIES.filter((s) => s.family === scope).map((s) => s.id),
        ...[...map.keys()].filter((k) => !SUBCATEGORIES.some((s) => s.id === k)),
      ];
  return ids.map((id) => {
    const v = map.get(id);
    const family = byFamily ? id : scope;
    const info = byFamily
      ? { label: (FAMILY_LABEL[id as Family] ?? id).replace(/^Finales (de )?/, ''), title: FAMILY_LABEL[id as Family] ?? id }
      : categoryInfo(id, family);
    return {
      id,
      family,
      label: info.label.charAt(0).toUpperCase() + info.label.slice(1),
      title: info.title,
      attempts: v?.n ?? 0,
      success: v?.ok ?? 0,
      rate: v && v.n ? v.ok / v.n : 0,
      maxSolved: v?.max ?? null,
      avgFailed: v && v.fails ? Math.round(v.failSum / v.fails) : null,
    };
  });
}
