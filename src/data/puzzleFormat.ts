// Format compact du fichier des finales Lichess (public/data/lichess-endgames.json).
//
// Même contenu que l'ancien format { puzzles: [...] }, mais en lignes-tableaux
// avec des dictionnaires (familles, thèmes) : le fichier passe d'environ 4 Mo à
// 1,6 Mo, donc moins à télécharger et à analyser au démarrage sur téléphone.
// Fonctions pures, partagées par le script d'import et par l'appli.

import type { Family } from '../core/types';

export interface RawPuzzle {
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

/** [id sans « lichess- », fen, dernier coup, solution (espaces), Elo, 0 gain/1 nulle, n° famille, n° thèmes, partie] */
export type CompactRow = [string, string, string, string, number, 0 | 1, number, number[], string];

export interface CompactFile {
  format: 2;
  source?: string;
  generated?: string;
  minPerSubcategory?: number;
  families: Family[];
  themes: string[];
  rows: CompactRow[];
}

const ID_PREFIX = 'lichess-';
const GAME_URL = /^https:\/\/lichess\.org\/(\w{8})(\/black)?#(\d+)$/;
const GAME_REF = /^(\w{8})(b?)(\d+)$/;

/** Nombre de pièces d'un FEN (rois compris). */
export function pieceCount(fen: string): number {
  let n = 0;
  for (const c of fen.split(' ')[0]) if (/[a-zA-Z]/.test(c)) n++;
  return n;
}

function encodeGameUrl(url: string): string {
  const m = GAME_URL.exec(url);
  return m ? `${m[1]}${m[2] ? 'b' : ''}${m[3]}` : url;
}

function decodeGameUrl(ref: string): string {
  const m = GAME_REF.exec(ref);
  return m ? `https://lichess.org/${m[1]}${m[2] ? '/black' : ''}#${m[3]}` : ref;
}

export function encodePuzzles(puzzles: RawPuzzle[], meta: Omit<CompactFile, 'format' | 'families' | 'themes' | 'rows'> = {}): CompactFile {
  const families = [...new Set(puzzles.map((p) => p.family))].sort();
  const themes = [...new Set(puzzles.flatMap((p) => p.themes))].sort();
  const fIdx = new Map(families.map((f, i) => [f, i]));
  const tIdx = new Map(themes.map((t, i) => [t, i]));
  const rows = puzzles.map((p): CompactRow => {
    if (p.ratingEstimated) throw new Error(`Format compact réservé aux puzzles Lichess (${p.id}).`);
    return [
      p.id.startsWith(ID_PREFIX) ? p.id.slice(ID_PREFIX.length) : `=${p.id}`,
      p.fen,
      p.lastMove,
      p.solution.join(' '),
      p.rating,
      p.objective === 'win' ? 0 : 1,
      fIdx.get(p.family)!,
      p.themes.map((t) => tIdx.get(t)!),
      encodeGameUrl(p.gameUrl),
    ];
  });
  return { format: 2, ...meta, families, themes, rows };
}

export function decodePuzzles(file: CompactFile): RawPuzzle[] {
  return file.rows.map(([id, fen, lastMove, solution, rating, objective, family, themes, game]) => ({
    id: id.startsWith('=') ? id.slice(1) : ID_PREFIX + id,
    fen,
    lastMove,
    solution: solution ? solution.split(' ') : [],
    rating,
    objective: objective === 0 ? 'win' : 'draw',
    family: file.families[family],
    pieces: pieceCount(fen),
    themes: themes.map((t) => file.themes[t]),
    gameUrl: decodeGameUrl(game),
  }));
}

/** Lit l'un ou l'autre format (compact ou ancien { puzzles }). */
export function readPuzzleFile(data: unknown): RawPuzzle[] {
  const d = data as Partial<CompactFile> & { puzzles?: RawPuzzle[] };
  if (d && d.format === 2 && Array.isArray(d.rows)) return decodePuzzles(d as CompactFile);
  if (d && Array.isArray(d.puzzles)) return d.puzzles;
  throw new Error('Fichier d’exercices illisible.');
}
