// Prise en compte de la ligne de la partie réelle (puzzles Lichess).
// La table de finales reste l'arbitre ; la ligne sert seulement à :
//  1. ne jamais refuser pour « lenteur » le coup joué dans la partie ;
//  2. faire rejouer à l'adversaire le coup de la partie quand il est
//     aussi bon (même résultat) que la défense la plus résistante.

import { outcomeOf } from './outcome';
import type { TbMove, TbPosition } from './tablebaseTypes';
import type { Verdict } from './tablebaseJudge';

/** Les coups joués jusqu'ici suivent-ils la ligne de la partie ? */
export function isOnLine(playedUci: string[], solution: string[] | undefined): boolean {
  if (!solution) return false;
  return playedUci.every((uci, i) => solution[i] === uci);
}

export function applyLineTolerance(
  verdict: Verdict,
  playedUci: string,
  previousUci: string[],
  solution: string[] | undefined,
): Verdict {
  if (verdict.kind !== 'bad' || verdict.reason !== 'too-slow') return verdict;
  if (!isOnLine(previousUci, solution) || solution?.[previousUci.length] !== playedUci) return verdict;
  return { kind: 'good', san: verdict.san, outcome: verdict.outcome, isBest: false, verified: true };
}

export function preferLineReply(
  position: TbPosition,
  defense: TbMove,
  previousUci: string[],
  solution: string[] | undefined,
): TbMove {
  if (!isOnLine(previousUci, solution)) return defense;
  const lineUci = solution?.[previousUci.length];
  const lineMove = position.moves.find((m) => m.uci === lineUci);
  if (lineMove && outcomeOf(lineMove.category) === outcomeOf(defense.category)) return lineMove;
  return defense;
}
