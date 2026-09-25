// Motivation : série de jours d'entraînement, puzzle du jour, badges.
// Tout est calculé à partir de l'historique (donc synchronisé avec le compte).

import type { PlayerRating } from './playerRating';

export interface Act {
  t: number;
  m: string;
  p: string;
  r: number;
  f: string;
  ok: boolean;
}
export interface RunLite {
  mode: string;
  score: number;
}

/** Jour local « AAAA-MM-JJ ». */
export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const prevDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1, 12).getTime());
};

export interface Streak {
  /** Jours consécutifs d'entraînement jusqu'à aujourd'hui (ou hier si pas encore joué aujourd'hui). */
  current: number;
  best: number;
  playedToday: boolean;
}

export function dayStreak(acts: { t: number }[], now: number): Streak {
  const days = new Set(acts.map((a) => dayKey(a.t)));
  const today = dayKey(now);
  const playedToday = days.has(today);
  let cursor = playedToday ? today : prevDay(today);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = prevDay(cursor);
  }
  // Meilleure série : parcours des jours triés
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let last: string | null = null;
  for (const d of sorted) {
    run = last && prevDay(d) === last ? run + 1 : 1;
    best = Math.max(best, run);
    last = d;
  }
  return { current, best, playedToday };
}

/** Puzzle du jour : le même pour tout le monde un jour donné (tirage déterministe par la date). */
export function dailyPick<T extends { id: string; rating: number }>(pool: T[], now: number): T | null {
  const candidates = pool.filter((p) => p.rating >= 1200 && p.rating <= 1900).sort((a, b) => a.id.localeCompare(b.id));
  if (!candidates.length) return null;
  let h = 2166136261; // FNV-1a sur la date
  for (const c of dayKey(now)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return candidates[h % candidates.length];
}

export interface Badge {
  id: string;
  icon: string;
  label: string;
  desc: string;
  earned: boolean;
  /** Progression lisible (ex. « 42/100 »). */
  progress?: string;
}

const FAMILIES = ['pions', 'tours', 'dames', 'fous', 'cavaliers', 'mixte'];

export function badges(acts: Act[], runs: RunLite[], streak: Streak, global: PlayerRating | undefined): Badge[] {
  const solved = acts.filter((a) => a.ok).length;
  const bestStorm = Math.max(0, ...runs.filter((r) => r.mode === 'storm').map((r) => r.score));
  const bestStreak = Math.max(0, ...runs.filter((r) => r.mode === 'streak').map((r) => r.score));
  const reviewsOk = acts.filter((a) => a.m === 'review' && a.ok).length;
  const techniqueOk = acts.filter((a) => a.m === 'training' && a.ok && !a.p.startsWith('bases-')).length;
  const dailyOk = acts.filter((a) => a.m === 'daily' && a.ok).length;
  const familiesOk = new Set(acts.filter((a) => a.ok).map((a) => a.f));
  const elo = global && !global.provisional ? global.r : 0;
  const count = (n: number, goal: number) => `${Math.min(n, goal)}/${goal}`;
  const b = (id: string, icon: string, label: string, desc: string, n: number, goal: number): Badge => ({
    id,
    icon,
    label,
    desc,
    earned: n >= goal,
    progress: count(n, goal),
  });
  return [
    b('first', '🌱', 'Premiers pas', 'Réussir un premier puzzle', solved, 1),
    b('100', '💯', 'Centurion', 'Réussir 100 puzzles', solved, 100),
    b('1000', '🏛️', 'Millier', 'Réussir 1 000 puzzles', solved, 1000),
    b('storm15', '⚡', 'Tempête', 'Score Storm de 15', bestStorm, 15),
    b('storm30', '🌪️', 'Ouragan', 'Score Storm de 30', bestStorm, 30),
    b('streak10', '🔥', 'Série de 10', '10 puzzles d’affilée en Streak', bestStreak, 10),
    b('streak25', '☄️', 'Série de 25', '25 puzzles d’affilée en Streak', bestStreak, 25),
    b('days7', '📅', 'Une semaine', '7 jours d’entraînement d’affilée', streak.best, 7),
    b('days30', '🗓️', 'Un mois', '30 jours d’entraînement d’affilée', streak.best, 30),
    b('review', '🔁', 'Leçons retenues', 'Réussir 10 révisions d’erreurs', reviewsOk, 10),
    b('technique', '🛠️', 'Technicien', 'Réussir 5 positions en mode technique', techniqueOk, 5),
    b('daily', '📌', 'Fidèle', 'Réussir 10 puzzles du jour', dailyOk, 10),
    b('allfam', '🧭', 'Touche-à-tout', 'Réussir un puzzle dans chaque famille', FAMILIES.filter((f) => familiesOk.has(f)).length, FAMILIES.length),
    b('elo1500', '🥉', 'Elo 1500', 'Elo finales (non provisoire) de 1500', elo, 1500),
    b('elo1800', '🥈', 'Elo 1800', 'Elo finales (non provisoire) de 1800', elo, 1800),
    b('elo2100', '🥇', 'Elo 2100', 'Elo finales (non provisoire) de 2100', elo, 2100),
  ].map((x) => (x.id.startsWith('elo') ? { ...x, progress: elo ? `${elo}` : 'provisoire' } : x));
}
