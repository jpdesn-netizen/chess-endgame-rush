// Choix du prochain puzzle d'une partie Rush.
//
//  1. Jamais deux fois le même puzzle dans une partie (`excluded`).
//  2. Difficulté : dans une fenêtre autour de l'Elo visé (un peu plus large
//     vers le haut) ; si elle est trop pauvre, les 8 puzzles les plus proches.
//  3. Variété : on évite de redonner le même sous-thème que le puzzle
//     précédent, et on préfère les puzzles pas vus récemment (autres parties),
//     tant qu'il reste assez de choix.
//  4. Tirage au hasard parmi les candidats retenus : l'ordre change à chaque partie.

import type { Puzzle } from '../types';

export interface PickOptions {
  /** Sous-thème du puzzle précédent (à éviter si possible). */
  previousSubcategory?: string;
  /** Puzzles joués lors des parties récentes (à éviter si possible). */
  recentlySeen?: ReadonlySet<string>;
}

const WINDOW_BELOW = 100;
const WINDOW_ABOVE = 150;
const MIN_CHOICE = 5;

export function pickNext(
  pool: Puzzle[],
  target: number,
  excluded: ReadonlySet<string>,
  random: () => number = Math.random,
  options: PickOptions = {},
): Puzzle | null {
  const available = pool.filter((p) => !excluded.has(p.id));
  if (available.length === 0) return null;

  // Difficulté
  let candidates = available.filter((p) => p.rating >= target - WINDOW_BELOW && p.rating <= target + WINDOW_ABOVE);
  if (candidates.length < MIN_CHOICE) {
    candidates = available
      .map((p) => ({ p, d: p.rating >= target ? p.rating - target : (target - p.rating) * 1.5 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)
      .map((x) => x.p);
  }

  // Variété (préférences, jamais bloquantes)
  const prefer = (keep: (p: Puzzle) => boolean) => {
    const kept = candidates.filter(keep);
    if (kept.length >= Math.min(MIN_CHOICE, candidates.length) && kept.length > 0) candidates = kept;
  };
  if (options.recentlySeen?.size) prefer((p) => !options.recentlySeen!.has(p.id));
  if (options.previousSubcategory) prefer((p) => p.subcategory !== options.previousSubcategory);

  return candidates[Math.floor(random() * candidates.length)];
}
