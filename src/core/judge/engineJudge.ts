// Jugement d'un coup par évaluation moteur (Stockfish), pour les positions
// hors de portée de la table de finales (plus de 7 pièces).
// Fonction pure : elle reçoit les évaluations déjà calculées.
//
// Règle (valeurs dans config.ts) :
//  - Objectif GAIN : le coup est bon si l'évaluation après le coup reste
//    ≥ min(seuilGain, meilleure − margeTolérée). Ex. : meilleur coup +5.0,
//    coup joué +3.1 → bon ; coup joué +0.4 → « laisse échapper le gain ».
//  - Objectif NULLE : bon si l'évaluation reste ≥ min(seuilNulle, meilleure − margeTolérée).
//  - Les scores de mat sont convertis en très grandes valeurs.

import type { Objective } from '../types';
import type { Verdict } from './tablebaseJudge';

export interface EngineScore {
  /** Centipions, du point de vue du camp qui a le trait. */
  cp?: number;
  /** Mat en N coups (positif : le camp au trait mate ; négatif : il est maté). */
  mate?: number;
}

export interface EngineJudgeOptions {
  winThresholdCp: number;
  drawThresholdCp: number;
  toleranceCp: number;
}

const MATE_VALUE = 100_000;

/** Score en centipions (mat = valeur extrême, plus proche = plus fort). */
export function toCp(score: EngineScore): number {
  if (score.mate !== undefined) {
    if (score.mate === 0) return -MATE_VALUE; // camp au trait maté
    return score.mate > 0 ? MATE_VALUE - score.mate : -MATE_VALUE - score.mate;
  }
  return score.cp ?? 0;
}

export function judgeByEngine(params: {
  objective: Objective;
  san: string;
  /** Évaluation de la position AVANT le coup (joueur au trait) = meilleur coup. */
  best: EngineScore;
  bestSan: string | null;
  bestUci: string | null;
  /** Évaluation APRÈS le coup (adversaire au trait). */
  after: EngineScore;
  /** Le coup joué donne-t-il mat ? */
  isCheckmate: boolean;
  options: EngineJudgeOptions;
}): Verdict {
  const { objective, san, options } = params;
  if (params.isCheckmate) return { kind: 'good', san, outcome: 'win', isBest: true, verified: true };

  const bestCp = toCp(params.best);
  const playedCp = -toCp(params.after); // retour au point de vue du joueur
  const floor =
    objective === 'win'
      ? Math.min(options.winThresholdCp, bestCp - options.toleranceCp)
      : Math.min(options.drawThresholdCp, bestCp - options.toleranceCp);

  if (playedCp >= floor) {
    return {
      kind: 'good',
      san,
      outcome: playedCp >= options.winThresholdCp ? 'win' : 'draw',
      isBest: playedCp >= bestCp - 30,
      verified: true,
    };
  }
  const losing = playedCp <= -options.winThresholdCp;
  return {
    kind: 'bad',
    san,
    reason: objective === 'win' && !losing ? 'throws-win' : 'loses',
    outcome: losing ? 'loss' : 'draw',
    bestMoves: params.bestSan ? [params.bestSan] : [],
    bestUci: params.bestUci ? [params.bestUci] : [],
  };
}

/** Texte lisible d'une évaluation (point de vue du joueur). */
export function formatScore(score: EngineScore): string {
  if (score.mate !== undefined) return score.mate > 0 ? `mat en ${score.mate}` : `maté en ${-score.mate}`;
  const v = (score.cp ?? 0) / 100;
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}
