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
