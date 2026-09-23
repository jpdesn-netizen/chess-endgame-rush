// Format des réponses de l'API tablebase de Lichess
// (https://tablebase.lichess.ovh/standard?fen=...), relevé le 23/09/2026.

export type TbCategory =
  | 'win'
  | 'unknown'
  | 'syzygy-win'
  | 'maybe-win'
  | 'cursed-win'
  | 'draw'
  | 'blessed-loss'
  | 'maybe-loss'
  | 'syzygy-loss'
  | 'loss';

/**
 * Un coup légal de la position. ATTENTION : `category`, `dtz` et `dtm` sont
 * exprimés du point de vue de l'ADVERSAIRE (le camp qui aura le trait après
 * ce coup). "loss" signifie donc que le coup est gagnant pour celui qui le joue.
 */
export interface TbMove {
  uci: string;
  san: string;
  category: TbCategory;
  dtz: number | null;
  dtm: number | null;
  zeroing: boolean;
  checkmate: boolean;
  stalemate: boolean;
  insufficient_material: boolean;
}

/** La position, du point de vue du camp qui a le trait. */
export interface TbPosition {
  category: TbCategory;
  dtz: number | null;
  dtm: number | null;
  checkmate: boolean;
  stalemate: boolean;
  insufficient_material: boolean;
  moves: TbMove[];
}

export type TablebaseLookup = (fen: string) => Promise<TbPosition>;
