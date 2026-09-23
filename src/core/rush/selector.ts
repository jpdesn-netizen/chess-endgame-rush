// Choix du prochain puzzle : le plus proche de l'Elo visé, parmi ceux pas
// encore joués, avec un peu de hasard pour varier les parties.

import type { Puzzle } from '../types';

export function pickNext(
  pool: Puzzle[],
  target: number,
  excluded: ReadonlySet<string>,
  random: () => number = Math.random,
): Puzzle | null {
  const available = pool.filter((p) => !excluded.has(p.id));
  if (available.length === 0) return null;
  // Les 8 plus proches de l'Elo visé (en privilégiant légèrement le dessus).
  const scored = available
    .map((p) => ({ p, d: p.rating >= target ? p.rating - target : (target - p.rating) * 1.5 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);
  return scored[Math.floor(random() * scored.length)].p;
}
