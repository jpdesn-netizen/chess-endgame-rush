// Juge un coup du joueur à partir de la réponse de la table de finales pour
// la position AVANT le coup. Fonction pure : aucun appel réseau ici.

import type { Outcome } from '../types';
import { outcomeAfterMove, outcomeOf, rankOf } from './outcome';
import type { TbMove, TbPosition } from './tablebaseTypes';

export type BadReason =
  /** L'objectif était le gain, la position devient nulle. */
  | 'throws-win'
  /** Le coup perd (la position devient perdante). */
  | 'loses'
  /** Le gain est conservé mais le coup rallonge trop le chemin (décision G). */
  | 'too-slow';

export type Verdict =
  | { kind: 'good'; san: string; outcome: Outcome; isBest: boolean; verified: boolean }
  | {
      kind: 'bad';
      san: string;
      reason: BadReason;
      outcome: Outcome;
      /** Coups de retard par rapport au meilleur coup (raison "too-slow"). */
      extraMoves?: number;
      /** Coups corrects (SAN), du meilleur au moins bon, 3 au maximum. */
      bestMoves: string[];
      bestUci: string[];
      /** Objectif gain : le meilleur coup matait en N coups (table avec distance au mat). */
      bestMateIn?: number;
      /** Réponse adverse qui punit le coup joué (SAN), si connue. */
      refutation?: string;
    };

export interface JudgeOptions {
  /** Tolérance de lenteur, en coups (décision G = 10). */
  slowMoveToleranceMoves: number;
}

type Metric = 'dtm' | 'dtz';

function distance(move: TbMove, metric: Metric): number {
  const value = metric === 'dtm' ? move.dtm : move.dtz;
  return value === null ? Number.POSITIVE_INFINITY : Math.abs(value);
}

/** DTM (distance au mat) si disponible pour tous les coups gagnants, sinon DTZ. */
function chooseMetric(winningMoves: TbMove[]): Metric {
  return winningMoves.every((m) => m.dtm !== null) ? 'dtm' : 'dtz';
}

/**
 * Mat en N coups (du camp qui joue `move`), d'après la distance au mat de la
 * position obtenue, exprimée en demi-coups du point de vue de l'adversaire.
 */
export function mateInAfter(move: TbMove): number | undefined {
  if (move.checkmate) return 1;
  if (move.dtm === null || outcomeOf(move.category) !== 'loss') return undefined;
  return Math.floor(Math.abs(move.dtm) / 2) + 1;
}

/** Coups atteignant au moins le résultat requis, triés du meilleur au moins bon. */
export function correctMoves(position: TbPosition): TbMove[] {
  const required = outcomeOf(position.category);
  const ok = position.moves.filter((m) => rankOf(outcomeAfterMove(m)) >= rankOf(required));
  if (required !== 'win') return ok;
  const metric = chooseMetric(ok);
  return [...ok].sort((a, b) => distance(a, metric) - distance(b, metric));
}

export function judgeMove(position: TbPosition, uci: string, options: JudgeOptions): Verdict | null {
  const played = position.moves.find((m) => m.uci === uci);
  if (!played) return null; // coup absent de la réponse : ne devrait pas arriver pour un coup légal

  const required = outcomeOf(position.category);
  const after = outcomeAfterMove(played);
  const best = correctMoves(position);
  const mate = required === 'win' && best[0] ? mateInAfter(best[0]) : undefined;
  const bestList = {
    bestMoves: best.slice(0, 3).map((m) => m.san),
    bestUci: best.slice(0, 3).map((m) => m.uci),
    ...(mate !== undefined ? { bestMateIn: mate } : {}),
  };

  // Position inconnue de la table : impossible de juger, on accepte.
  if (required === 'unknown') {
    return { kind: 'good', san: played.san, outcome: after, isBest: false, verified: false };
  }

  if (played.checkmate) {
    return { kind: 'good', san: played.san, outcome: 'win', isBest: true, verified: true };
  }

  if (rankOf(after) < rankOf(required)) {
    return {
      kind: 'bad',
      san: played.san,
      reason: after === 'loss' ? 'loses' : 'throws-win',
      outcome: after,
      ...bestList,
    };
  }

  // Gain conservé : contrôle de la lenteur (décision G).
  if (required === 'win') {
    const metric = chooseMetric(best);
    // Avec la DTZ, un coup de pion ou une prise remet le compteur à zéro :
    // on ne compare alors que des coups « ordinaires » entre eux, et un coup
    // de pion ou une prise joué par le joueur est accepté.
    const reference = metric === 'dtz' ? best.filter((m) => !m.zeroing) : best;
    const comparable = reference.length > 0 && !(metric === 'dtz' && played.zeroing);
    const bestDistance = comparable ? Math.min(...reference.map((m) => distance(m, metric))) : 0;
    const playedDistance = distance(played, metric);
    const extraPlies = comparable ? playedDistance - bestDistance : 0;
    if (comparable && extraPlies > options.slowMoveToleranceMoves * 2) {
      return {
        kind: 'bad',
        san: played.san,
        reason: 'too-slow',
        outcome: after,
        extraMoves: Math.ceil(extraPlies / 2),
        ...bestList,
      };
    }
    return { kind: 'good', san: played.san, outcome: after, isBest: extraPlies <= 0, verified: true };
  }

  // Objectif nulle (ou mieux) atteint.
  return { kind: 'good', san: played.san, outcome: after, isBest: true, verified: true };
}
