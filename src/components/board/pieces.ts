// Pièces dessinées avec les symboles d'échecs Unicode (pleins), colorés en SVG.
// Le sélecteur de variation U+FE0E force l'affichage « texte » (sinon certains
// systèmes affichent le pion ♟ en emoji).

import type { Color } from '../../core/types';

const TEXT_STYLE = '︎';

export const PIECE_GLYPH: Record<'k' | 'q' | 'r' | 'b' | 'n' | 'p', string> = {
  k: '♚' + TEXT_STYLE,
  q: '♛' + TEXT_STYLE,
  r: '♜' + TEXT_STYLE,
  b: '♝' + TEXT_STYLE,
  n: '♞' + TEXT_STYLE,
  p: '♟' + TEXT_STYLE,
};

export const PIECE_FONT = '"Segoe UI Symbol", "Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", "Arial Unicode MS", serif';

export function pieceStyle(color: Color) {
  return {
    fontSize: 0.82,
    textAnchor: 'middle' as const,
    dominantBaseline: 'central' as const,
    fontFamily: PIECE_FONT,
    fill: color === 'w' ? '#ffffff' : '#1c1917',
    stroke: color === 'w' ? '#1c1917' : '#f5f5f4',
    strokeWidth: color === 'w' ? 0.035 : 0.012,
    paintOrder: 'stroke' as const,
  };
}
