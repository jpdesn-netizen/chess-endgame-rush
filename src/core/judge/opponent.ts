// Choix de la réponse adverse : la défense la plus résistante selon la table.

import { outcomeOf, rankOf } from './outcome';
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
