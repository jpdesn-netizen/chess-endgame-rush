// Classement automatique d'une position par matériel, sur le modèle
// d'Endgame Trainer (familles Pions / Tours / Dames / Cavaliers / Fous).

import { fenToPieces } from './fen';
import type { Color, Family } from './types';

const LETTER_FR: Record<string, string> = { k: 'R', q: 'D', r: 'T', b: 'F', n: 'C', p: 'P' };
const ORDER = ['k', 'q', 'r', 'b', 'n', 'p'];

function sideString(types: string[]): string {
  const sorted = [...types].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return sorted.map((t) => LETTER_FR[t]).join('+');
}

/**
 * Signature lisible, du point de vue du camp `perspective`.
 * Ex. finale de Lucena vue par les Blancs : "R+T+P vs R+T".
 */
export function materialSignature(fen: string, perspective: Color): string {
  const pieces = fenToPieces(fen);
  const mine = pieces.filter((p) => p.color === perspective).map((p) => p.type);
  const theirs = pieces.filter((p) => p.color !== perspective).map((p) => p.type);
  return `${sideString(mine)} vs ${sideString(theirs)}`;
}

/** Famille déduite des pièces autres que rois et pions. */
export function familyOf(fen: string): Family {
  const pieces = fenToPieces(fen).filter((p) => p.type !== 'k' && p.type !== 'p');
  const types = new Set(pieces.map((p) => p.type));
  const hasPawns = fenToPieces(fen).some((p) => p.type === 'p');
  if (types.size === 0) return hasPawns ? 'pions' : 'mixte';
  if (types.size > 1) return 'mixte';
  const only = [...types][0];
  return ({ q: 'dames', r: 'tours', b: 'fous', n: 'cavaliers' } as const)[only as 'q' | 'r' | 'b' | 'n'];
}

export const FAMILY_LABEL: Record<Family, string> = {
  pions: 'Finales de pions',
  tours: 'Finales de tours',
  dames: 'Finales de dames',
  cavaliers: 'Finales de cavaliers',
  fous: 'Finales de fous',
  mixte: 'Finales mixtes',
  mats: 'Mats élémentaires',
};
