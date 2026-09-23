import type { Outcome } from '../types';
import type { TbCategory, TbMove } from './tablebaseTypes';

/**
 * Traduit une catégorie de la table en résultat pratique pour le camp concerné.
 * "cursed-win" / "blessed-loss" : gain ou perte théorique, mais nulle avec la
 * règle des 50 coups → on les compte comme nulles (c'est le résultat réel).
 */
export function outcomeOf(category: TbCategory): Outcome {
  switch (category) {
    case 'win':
    case 'syzygy-win':
    case 'maybe-win':
      return 'win';
    case 'draw':
    case 'cursed-win':
    case 'blessed-loss':
      return 'draw';
    case 'loss':
    case 'syzygy-loss':
    case 'maybe-loss':
      return 'loss';
    default:
      return 'unknown';
  }
}

export function invert(outcome: Outcome): Outcome {
  if (outcome === 'win') return 'loss';
  if (outcome === 'loss') return 'win';
  return outcome;
}

/** Résultat, pour celui qui joue le coup, après ce coup. */
export function outcomeAfterMove(move: TbMove): Outcome {
  return invert(outcomeOf(move.category));
}

const RANK: Record<Outcome, number> = { loss: 0, unknown: 1, draw: 1, win: 2 };

export function rankOf(outcome: Outcome): number {
  return RANK[outcome];
}
