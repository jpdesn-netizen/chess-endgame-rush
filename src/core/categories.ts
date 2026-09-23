// Sous-catégories de finales par matériel exact, sur le modèle d'Endgame
// Trainer (relevé du 23/09/2026) : Pions (R+P vs R…), Tours (T vs P…),
// Dames, Cavaliers, Fous — complété par des sous-thèmes « mixtes » courants.
// Le camp « fort » (plus de matériel) est toujours écrit en premier, quel que
// soit le camp qui joue.

import { fenToPieces } from './fen';
import { familyOf } from './material';
import type { Family } from './types';

type Piece = 'q' | 'r' | 'b' | 'n' | 'p';
export type Counts = Record<Piece, number>;

const VALUE: Record<Piece, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };
const EMPTY: Counts = { q: 0, r: 0, b: 0, n: 0, p: 0 };

export interface SubCategory {
  id: string;
  family: Family;
  /** Libellé en symboles : blanc = camp fort, noir = camp faible. */
  label: string;
  /** Libellé en toutes lettres (infobulle, lecteurs d'écran). */
  title: string;
  match: (strong: Counts, weak: Counts) => boolean;
}

const eq = (c: Counts, want: Partial<Counts>) => (Object.keys(EMPTY) as Piece[]).every((k) => c[k] === (want[k] ?? 0));
const exact = (s: Partial<Counts>, w: Partial<Counts>) => (strong: Counts, weak: Counts) => eq(strong, s) && eq(weak, w);
/** Pièces exactes, nombre de pions libre. */
const pieces = (s: Partial<Counts>, w: Partial<Counts>) => (strong: Counts, weak: Counts) =>
  eq({ ...strong, p: 0 }, s) && eq({ ...weak, p: 0 }, w);

export const SUBCATEGORIES: SubCategory[] = [
  // Pions (rois affichés, comme sur Endgame Trainer)
  { id: 'kp-k', family: 'pions', label: '♔♙ vs ♚', title: 'Roi et pion contre roi', match: exact({ p: 1 }, {}) },
  { id: 'kp-kp', family: 'pions', label: '♔♙ vs ♚♟', title: 'Roi et pion contre roi et pion', match: exact({ p: 1 }, { p: 1 }) },
  { id: 'k2p-k', family: 'pions', label: '♔♙♙ vs ♚', title: 'Roi et deux pions contre roi', match: exact({ p: 2 }, {}) },
  { id: 'k2p-kp', family: 'pions', label: '♔♙♙ vs ♚♟', title: 'Roi et deux pions contre roi et pion', match: exact({ p: 2 }, { p: 1 }) },
  { id: 'k2p-k2p', family: 'pions', label: '♔♙♙ vs ♚♟♟', title: 'Deux pions contre deux pions', match: exact({ p: 2 }, { p: 2 }) },
  // Tours
  { id: 'r-p', family: 'tours', label: '♖ vs ♟', title: 'Tour contre pion', match: exact({ r: 1 }, { p: 1 }) },
  { id: 'r-2p', family: 'tours', label: '♖ vs ♟♟', title: 'Tour contre deux pions', match: exact({ r: 1 }, { p: 2 }) },
  { id: 'r-r', family: 'tours', label: '♖ vs ♜', title: 'Tour contre tour', match: exact({ r: 1 }, { r: 1 }) },
  { id: 'rp-r', family: 'tours', label: '♖♙ vs ♜', title: 'Tour et pion contre tour (Lucena, Philidor…)', match: exact({ r: 1, p: 1 }, { r: 1 }) },
  { id: 'rp-rp', family: 'tours', label: '♖♙ vs ♜♟', title: 'Tour et pion contre tour et pion', match: exact({ r: 1, p: 1 }, { r: 1, p: 1 }) },
  { id: 'r2p-r', family: 'tours', label: '♖♙♙ vs ♜', title: 'Tour et deux pions contre tour', match: exact({ r: 1, p: 2 }, { r: 1 }) },
  { id: 'r2p-rp', family: 'tours', label: '♖♙♙ vs ♜♟', title: 'Tour et deux pions contre tour et pion', match: exact({ r: 1, p: 2 }, { r: 1, p: 1 }) },
  // Dames
  { id: 'q-p', family: 'dames', label: '♕ vs ♟', title: 'Dame contre pion', match: exact({ q: 1 }, { p: 1 }) },
  { id: 'q-2p', family: 'dames', label: '♕ vs ♟♟', title: 'Dame contre deux pions', match: exact({ q: 1 }, { p: 2 }) },
  { id: 'q-q', family: 'dames', label: '♕ vs ♛', title: 'Dame contre dame', match: exact({ q: 1 }, { q: 1 }) },
  { id: 'qp-q', family: 'dames', label: '♕♙ vs ♛', title: 'Dame et pion contre dame', match: exact({ q: 1, p: 1 }, { q: 1 }) },
  { id: 'qp-qp', family: 'dames', label: '♕♙ vs ♛♟', title: 'Dame et pion contre dame et pion', match: exact({ q: 1, p: 1 }, { q: 1, p: 1 }) },
  // Cavaliers
  { id: 'n-p', family: 'cavaliers', label: '♘ vs ♟', title: 'Cavalier contre pion', match: exact({ n: 1 }, { p: 1 }) },
  { id: 'n-2p', family: 'cavaliers', label: '♘ vs ♟♟', title: 'Cavalier contre deux pions', match: exact({ n: 1 }, { p: 2 }) },
  { id: 'n-n', family: 'cavaliers', label: '♘ vs ♞ (+ pions)', title: 'Cavalier contre cavalier, avec pions', match: pieces({ n: 1 }, { n: 1 }) },
  // Fous
  { id: 'bp-b', family: 'fous', label: '♗♙ vs ♝', title: 'Fou et pion contre fou', match: exact({ b: 1, p: 1 }, { b: 1 }) },
  { id: 'b2p-b', family: 'fous', label: '♗♙♙ vs ♝', title: 'Fou et deux pions contre fou', match: exact({ b: 1, p: 2 }, { b: 1 }) },
  { id: 'b-p', family: 'fous', label: '♗ vs ♟ (+ pions)', title: 'Fou contre pions', match: pieces({ b: 1 }, {}) },
  // Mixtes (pions libres)
  { id: 'q-r', family: 'mixte', label: '♕ vs ♜', title: 'Dame contre tour', match: pieces({ q: 1 }, { r: 1 }) },
  { id: 'r-b', family: 'mixte', label: '♖ vs ♝', title: 'Tour contre fou', match: pieces({ r: 1 }, { b: 1 }) },
  { id: 'r-n', family: 'mixte', label: '♖ vs ♞', title: 'Tour contre cavalier', match: pieces({ r: 1 }, { n: 1 }) },
  { id: 'b-n', family: 'mixte', label: '♗ vs ♞', title: 'Fou contre cavalier', match: pieces({ b: 1 }, { n: 1 }) },
  { id: 'rb-r', family: 'mixte', label: '♖♗ vs ♜', title: 'Tour et fou contre tour', match: pieces({ r: 1, b: 1 }, { r: 1 }) },
  { id: 'rn-r', family: 'mixte', label: '♖♘ vs ♜', title: 'Tour et cavalier contre tour', match: pieces({ r: 1, n: 1 }, { r: 1 }) },
];

export const OTHER_LABEL = 'Autres';

function countsOf(fen: string): { w: Counts; b: Counts } {
  const w = { ...EMPTY };
  const b = { ...EMPTY };
  for (const p of fenToPieces(fen)) {
    if (p.type === 'k') continue;
    (p.color === 'w' ? w : b)[p.type] += 1;
  }
  return { w, b };
}

const value = (c: Counts) => (Object.keys(c) as Piece[]).reduce((s, k) => s + c[k] * VALUE[k], 0);

/** Matériel ordonné : camp fort d'abord. */
export function orderedCounts(fen: string): { strong: Counts; weak: Counts } {
  const { w, b } = countsOf(fen);
  return value(w) >= value(b) ? { strong: w, weak: b } : { strong: b, weak: w };
}

/** Identifiant de sous-catégorie, ou `${famille}-autres`. */
export function subcategoryOf(fen: string, family: Family = familyOf(fen)): string {
  const { strong, weak } = orderedCounts(fen);
  const found = SUBCATEGORIES.find((s) => s.family === family && (s.match(strong, weak) || s.match(weak, strong)));
  return found ? found.id : `${family}-autres`;
}
