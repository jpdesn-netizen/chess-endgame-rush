// Elo personnel par thème, calculé comme Lichess (Glicko-2, un puzzle = une
// partie contre le puzzle), à partir de l'historique du joueur.
//
// Choix documentés :
//  - départ 1500, écart-type 500 (Lichess : « 1500 ± 1000 ») ; provisoire (« ? ») si écart-type > 110 ;
//  - tau = 0,5 (l'article de Glickman conseille 0,3 à 1,2 ; valeur de son exemple) ;
//  - seule la PREMIÈRE tentative de chaque puzzle compte (les rejouer n'influe pas), hors révision ;
//  - l'écart-type des puzzles n'est pas conservé dans nos données : on prend 75 pour les puzzles
//    Lichess (sélectionnés avec un écart-type ≤ 100 le plus souvent) et 200 pour les exercices
//    générés (Elo estimé) ; les « Bases » (Elo estimé à la main) ne comptent pas.

import { updateRating, type Rating } from './glicko2';

export const START: Rating = { r: 1500, rd: 500, vol: 0.06 };
export const PROVISIONAL_RD = 110;
const TAU = 0.5;

export interface RatedAttempt {
  t: number;
  m: string;
  p: string;
  r: number;
  c: string;
  f: string;
  ok: boolean;
}

export interface PlayerRating {
  r: number;
  rd: number;
  games: number;
  provisional: boolean;
}

const puzzleRd = (id: string) => (id.startsWith('tb-') ? 200 : 75);

/** Elo par clé (« all », famille, sous-thème), en rejouant l'historique dans l'ordre. */
export function ratingsByKey(attempts: RatedAttempt[]): Map<string, PlayerRating> {
  const seen = new Set<string>();
  const state = new Map<string, { rating: Rating; games: number }>();
  const sorted = [...attempts].sort((a, b) => a.t - b.t);
  for (const a of sorted) {
    if (a.m === 'review' || a.p.startsWith('bases-') || seen.has(a.p)) continue;
    seen.add(a.p);
    for (const key of ['all', `f:${a.f}`, `c:${a.c}`]) {
      const cur = state.get(key) ?? { rating: START, games: 0 };
      cur.rating = updateRating(cur.rating, [{ r: a.r, rd: puzzleRd(a.p), s: a.ok ? 1 : 0 }], TAU);
      cur.games += 1;
      state.set(key, cur);
    }
  }
  const out = new Map<string, PlayerRating>();
  for (const [k, v] of state) {
    out.set(k, { r: Math.round(v.rating.r), rd: Math.round(v.rating.rd), games: v.games, provisional: v.rating.rd > PROVISIONAL_RD });
  }
  return out;
}

export const formatRating = (p: PlayerRating | undefined) => (p ? `${p.r}${p.provisional ? '?' : ''}` : '–');
