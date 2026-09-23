// Petits constructeurs de réponses de table de finales pour les tests.

import type { TbCategory, TbMove, TbPosition } from '../src/core/judge/tablebaseTypes';

export function tbMove(uci: string, san: string, category: TbCategory, dtm: number | null, dtz: number | null = dtm, extra: Partial<TbMove> = {}): TbMove {
  return {
    uci,
    san,
    category,
    dtm,
    dtz,
    zeroing: false,
    checkmate: false,
    stalemate: false,
    insufficient_material: false,
    ...extra,
  };
}

export function tbPosition(category: TbCategory, moves: TbMove[], dtm: number | null = null): TbPosition {
  return { category, dtm, dtz: dtm, checkmate: false, stalemate: false, insufficient_material: false, moves };
}
