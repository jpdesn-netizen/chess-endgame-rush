// Choix de la réponse adverse : la défense la plus résistante selon la table.

import { outcomeOf, rankOf } from './outcome';
import type { RankedMove } from '../../services/stockfish';
import { toCp } from './engineJudge';
import type { TbMove, TbPosition } from './tablebaseTypes';

/**
 * `position` est la position où l'ADVERSAIRE a le trait. Les catégories des
 * coups y sont exprimées du point de vue du JOUEUR (qui rejouera ensuite).
 * L'adversaire choisit :
 *   1. le coup le pire pour le joueur (perte > nulle > gain) ;
 *   2. à résultat égal quand le joueur gagne : le mat le plus lointain ;
 *   3. quand le joueur perd : le gain le plus rapide pour l'adversaire.
 */
export function chooseDefense(position: TbPosition): TbMove | null {
  if (position.moves.length === 0) return null;

  const playerRank = (m: TbMove) => rankOf(outcomeOf(m.category));
  const hasDtm = position.moves.every((m) => m.dtm !== null);
  const dist = (m: TbMove) => {
    const v = hasDtm ? m.dtm : m.dtz;
    return v === null ? 0 : Math.abs(v);
  };

  const sorted = [...position.moves].sort((a, b) => {
    const byOutcome = playerRank(a) - playerRank(b); // le pire pour le joueur d'abord
    if (byOutcome !== 0) return byOutcome;
    const outcome = outcomeOf(a.category);
    if (outcome === 'win') return dist(b) - dist(a); // résister le plus longtemps
    if (outcome === 'loss') return dist(a) - dist(b); // gagner le plus vite
    return 0; // nulle : ordre de la table
  });
  return sorted[0];
}

/**
 * Entraînement : défenses quasi aussi fortes que la meilleure, pour que
 * l'adversaire ne rejoue pas toujours la même séquence :
 *  - même résultat pour le joueur que la meilleure défense (jamais un cadeau) ;
 *  - joueur gagnant : mat (ou conversion) retardé au plus `toleranceMoves` coup de moins que le maximum ;
 *  - joueur perdant : gain adverse au plus `toleranceMoves` coup plus lent ;
 *  - nulle : tous les coups qui la gardent (Stockfish choisit ensuite parmi les plus coriaces).
 */
export function strongestDefenses(position: TbPosition, toleranceMoves = 1): TbMove[] {
  const best = chooseDefense(position);
  if (!best) return [];
  const outcome = outcomeOf(best.category);
  const hasDtm = position.moves.every((m) => m.dtm !== null);
  const dist = (m: TbMove) => {
    const v = hasDtm ? m.dtm : m.dtz;
    return v === null ? 0 : Math.abs(v);
  };
  const plies = toleranceMoves * 2;
  return position.moves.filter((m) => {
    if (outcomeOf(m.category) !== outcome) return false;
    if (outcome === 'win') return dist(m) >= dist(best) - plies;
    if (outcome === 'loss') return dist(m) <= dist(best) + plies;
    return true;
  });
}

/**
 * Tirage parmi les coups que Stockfish juge presque aussi bons que son
 * meilleur (écart ≤ `marginCp` centipions) : variété sans coup faible.
 */
export function pickNearBest(lines: RankedMove[], random: () => number = Math.random, marginCp = 25): string | null {
  if (lines.length === 0) return null;
  const top = toCp(lines[0].score);
  const near = lines.filter((l) => toCp(l.score) >= top - marginCp);
  return near[Math.floor(random() * near.length)]?.move ?? lines[0].move;
}
