// SEUL fichier de l'application qui importe chess.js.
// Toutes les fonctions sont pures : elles prennent un FEN et renvoient un
// résultat, sans état caché (plus simple à tester et à raisonner).

import { Chess } from 'chess.js';
import type { PromotionPiece } from './types';

export interface AppliedMove {
  fenBefore: string;
  fen: string;
  uci: string;
  san: string;
  from: string;
  to: string;
  isCheckmate: boolean;
  isStalemate: boolean;
  /** Matériel insuffisant pour mater (ex. R vs R). */
  isInsufficientMaterial: boolean;
}

function load(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

export function isValidFen(fen: string): boolean {
  return load(fen) !== null;
}

/** Cases d'arrivée légales pour la pièce située sur `from`. */
export function legalDestinations(fen: string, from: string): string[] {
  const chess = load(fen);
  if (!chess) return [];
  // chess.js type `square` avec un type littéral ; la valeur vient de l'échiquier.
  const moves = chess.moves({ square: from as never, verbose: true });
  return [...new Set(moves.map((m) => m.to as string))];
}

/** Vrai si le coup from→to est une promotion (il faut alors choisir la pièce). */
export function isPromotionMove(fen: string, from: string, to: string): boolean {
  const chess = load(fen);
  if (!chess) return false;
  const moves = chess.moves({ square: from as never, verbose: true });
  return moves.some((m) => m.to === to && Boolean(m.promotion));
}

/**
 * Joue un coup. Renvoie null si le coup est illégal (chess.js 1.x lève une
 * exception dans ce cas : elle est interceptée ici).
 */
export function applyMove(fen: string, from: string, to: string, promotion?: PromotionPiece): AppliedMove | null {
  const chess = load(fen);
  if (!chess) return null;
  let move;
  try {
    move = chess.move({ from, to, promotion });
  } catch {
    return null;
  }
  if (!move) return null;
  return {
    fenBefore: fen,
    fen: chess.fen(),
    uci: `${move.from}${move.to}${move.promotion ?? ''}`,
    san: move.san,
    from: move.from,
    to: move.to,
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    isInsufficientMaterial: chess.isInsufficientMaterial(),
  };
}

export function applyUci(fen: string, uci: string): AppliedMove | null {
  const promotion = uci.length > 4 ? (uci[4] as PromotionPiece) : undefined;
  return applyMove(fen, uci.slice(0, 2), uci.slice(2, 4), promotion);
}
