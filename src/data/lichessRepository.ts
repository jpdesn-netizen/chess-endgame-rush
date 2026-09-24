// Chargement des finales Lichess (public/data/lichess-endgames.json,
// produit par scripts/import-lichess.ts). Chargé une seule fois.

import { FAMILY_LABEL, familyOf } from '../core/material';
import type { Family, Puzzle } from '../core/types';

interface RawPuzzle {
  id: string;
  fen: string;
  lastMove: string;
  solution: string[];
  rating: number;
  objective: 'win' | 'draw';
  family: Family;
  pieces?: number;
  themes: string[];
  gameUrl: string;
  /** Exercices générés avec la table de finales : Elo estimé. */
  ratingEstimated?: boolean;
}

const THEME_FR: Record<string, string> = {
  advancedPawn: 'pion avancé',
  promotion: 'promotion',
  underPromotion: 'sous-promotion',
  crushing: 'gain décisif',
  advantage: 'avantage',
  equality: 'égalisation',
  mate: 'mat',
  mateIn1: 'mat en 1',
  mateIn2: 'mat en 2',
  mateIn3: 'mat en 3',
  mateIn4: 'mat en 4',
  mateIn5: 'mat en 5+',
  zugzwang: 'zugzwang',
  skewer: 'enfilade',
  fork: 'fourchette',
  pin: 'clouage',
  hangingPiece: 'pièce en prise',
  defensiveMove: 'coup défensif',
  quietMove: 'coup calme',
  sacrifice: 'sacrifice',
  deflection: 'déviation',
  attraction: 'attraction',
  discoveredAttack: 'attaque à la découverte',
  xRayAttack: 'rayons X',
  intermezzo: 'coup intermédiaire',
  exposedKing: 'roi exposé',
  trappedPiece: 'pièce piégée',
  clearance: 'dégagement',
  interference: 'interférence',
  capturingDefender: 'élimination du défenseur',
  doubleCheck: 'échec double',
  backRankMate: 'mat du couloir',
  pawnEndgame: 'finale de pions',
  rookEndgame: 'finale de tours',
  queenEndgame: 'finale de dames',
  bishopEndgame: 'finale de fous',
  knightEndgame: 'finale de cavaliers',
  queenRookEndgame: 'dame et tour',
};

const ENDGAME_THEME_KEYS = new Set(['pawnEndgame', 'rookEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame', 'queenRookEndgame']);

function levelOf(rating: number): Puzzle['level'] {
  if (rating < 1200) return 'debutant';
  if (rating < 1600) return 'intermediaire';
  if (rating < 2000) return 'avance';
  return 'master';
}

function toPuzzle(raw: RawPuzzle): Puzzle {
  const family = raw.family ?? familyOf(raw.fen);
  const themes = raw.themes.filter((t) => !ENDGAME_THEME_KEYS.has(t)).map((t) => THEME_FR[t] ?? t);
  if (raw.ratingEstimated) {
    return {
      id: raw.id,
      title: `${FAMILY_LABEL[family]} · table de finales Lichess`,
      fen: raw.fen,
      objective: raw.objective,
      collection: 'tablebase',
      level: levelOf(raw.rating),
      rating: raw.rating,
      ratingEstimated: true,
      concept: 'Position générée ; un seul coup juste, vérifié par la table de finales. Elo estimé.',
      family,
      lastMove: raw.lastMove || undefined,
      solution: raw.solution,
      themes: raw.themes,
    };
  }
  return {
    id: raw.id,
    title: `${FAMILY_LABEL[family]}${(raw.pieces ?? 0) > 7 ? ' (longue)' : ''} · Lichess`,
    fen: raw.fen,
    objective: raw.objective,
    collection: 'lichess',
    level: levelOf(raw.rating),
    rating: raw.rating,
    concept: themes.length ? `Thèmes : ${themes.join(', ')}` : 'Position issue d’une partie réelle.',
    family,
    lastMove: raw.lastMove,
    solution: raw.solution,
    themes: raw.themes,
    gameUrl: raw.gameUrl,
  };
}

let cache: Promise<Puzzle[]> | null = null;

async function fetchPuzzles(file: string, optional: boolean): Promise<RawPuzzle[]> {
  const r = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!r.ok) {
    if (optional) return [];
    throw new Error(`Chargement des finales Lichess impossible (HTTP ${r.status}).`);
  }
  const data = (await r.json()) as { puzzles: RawPuzzle[] };
  return data.puzzles;
}

/**
 * Finales Lichess (puzzles, Elo Lichess) + exercices générés avec la table de
 * finales (fichier facultatif, Elo estimé) pour les sous-thèmes trop pauvres.
 */
export function loadLichessPuzzles(): Promise<Puzzle[]> {
  if (!cache) {
    cache = Promise.all([
      fetchPuzzles('lichess-endgames.json', false),
      fetchPuzzles('tablebase-endgames.json', true).catch(() => []),
    ])
      .then(([lichess, generated]) => [...lichess, ...generated].map(toPuzzle))
      .catch((error) => {
        cache = null;
        throw error;
      });
  }
  return cache;
}
