// Chargement des finales Lichess (public/data/lichess-endgames.json,
// produit par scripts/import-lichess.mjs). Chargé une seule fois.

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
  themes: string[];
  gameUrl: string;
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
  return {
    id: raw.id,
    title: `${FAMILY_LABEL[family]} · Lichess`,
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

export function loadLichessPuzzles(): Promise<Puzzle[]> {
  if (!cache) {
    cache = fetch(`${import.meta.env.BASE_URL}data/lichess-endgames.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Chargement des finales Lichess impossible (HTTP ${r.status}).`);
        return r.json() as Promise<{ puzzles: RawPuzzle[] }>;
      })
      .then((data) => data.puzzles.map(toPuzzle))
      .catch((error) => {
        cache = null;
        throw error;
      });
  }
  return cache;
}
