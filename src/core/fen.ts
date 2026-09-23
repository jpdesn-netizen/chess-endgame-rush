// Lecture légère d'un FEN, sans chess.js (utilisée par l'affichage et le
// classement par matériel, où il faut aller vite).

import type { Color } from './types';

export interface BoardPiece {
  square: string; // ex. "e4"
  color: Color;
  type: 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
}

const FILES = 'abcdefgh';

export function sideToMove(fen: string): Color {
  return fen.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

/** Liste des pièces présentes sur l'échiquier. */
export function fenToPieces(fen: string): BoardPiece[] {
  const placement = fen.trim().split(/\s+/)[0];
  const ranks = placement.split('/');
  if (ranks.length !== 8) throw new Error(`FEN invalide (rangées) : ${fen}`);
  const pieces: BoardPiece[] = [];
  ranks.forEach((row, i) => {
    const rank = 8 - i;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
      } else {
        const lower = ch.toLowerCase();
        if (!'kqrbnp'.includes(lower)) throw new Error(`FEN invalide (pièce "${ch}") : ${fen}`);
        pieces.push({
          square: `${FILES[file]}${rank}`,
          color: ch === lower ? 'b' : 'w',
          type: lower as BoardPiece['type'],
        });
        file += 1;
      }
    }
    if (file !== 8) throw new Error(`FEN invalide (colonnes rangée ${rank}) : ${fen}`);
  });
  return pieces;
}

export function countPieces(fen: string): number {
  return fenToPieces(fen).length;
}

/**
 * Clé de répétition : placement, trait, roques, prise en passant
 * (sans les compteurs de coups).
 */
export function positionKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

export function squareToCoords(square: string): { file: number; rank: number } {
  return { file: FILES.indexOf(square[0]), rank: Number(square[1]) - 1 };
}

export function coordsToSquare(file: number, rank: number): string {
  return `${FILES[file]}${rank + 1}`;
}

export function parseUci(uci: string): { from: string; to: string; promotion?: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}
