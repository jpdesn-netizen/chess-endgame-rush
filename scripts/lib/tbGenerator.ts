// Génération d'exercices de finale à partir de la table de finales Lichess.
// Fonctions pures (la recherche dans la table est injectée) : testables sans réseau.
//
// Un exercice est retenu quand, comme un puzzle Lichess :
//  - la position a le résultat visé pour le camp au trait (gain, ou nulle en défense) ;
//  - il y a au moins 2 coups légaux et UN SEUL coup qui atteint l'objectif ;
// la ligne continue tant que le coup juste reste unique (6 coups au plus),
// l'adversaire jouant la défense la plus résistante (même règle que l'appli).
//
// L'Elo est une ESTIMATION (personne n'a encore joué ces positions) : voir estimateRating.

import { chooseDefense } from '../../src/core/judge/opponent';
import { outcomeAfterMove, outcomeOf } from '../../src/core/judge/outcome';
import type { TbMove, TbPosition } from '../../src/core/judge/tablebaseTypes';
import { subcategoryOf } from '../../src/core/categories';
import { applyUci, isInCheck, isValidFen } from '../../src/core/chessRules';
import { familyOf } from '../../src/core/material';
import type { Objective } from '../../src/core/types';

export type Lookup = (fen: string) => Promise<TbPosition>;

/** Matériel de chaque sous-thème à générer (hors rois) : camp fort / camp faible. */
export const MATERIAL: Record<string, { strong: string; weak: string }> = {
  'kp-k': { strong: 'P', weak: '' },
  'k2p-k': { strong: 'PP', weak: '' },
  'bp-b': { strong: 'BP', weak: 'B' },
  'b2p-b': { strong: 'BPP', weak: 'B' },
};

const FILES = 'abcdefgh';

/** Position aléatoire légale du sous-thème ; `null` si le tirage est à refaire. */
export function randomPosition(sub: string, objective: Objective, rnd: () => number): string | null {
  const mat = MATERIAL[sub];
  const strong: 'w' | 'b' = rnd() < 0.5 ? 'w' : 'b';
  const weak = strong === 'w' ? 'b' : 'w';
  const board: (string | null)[] = new Array(64).fill(null); // index = rang*8 + colonne, rang 0 = 1re rangée
  const place = (piece: string, color: 'w' | 'b'): boolean => {
    for (let tries = 0; tries < 50; tries++) {
      const i = Math.floor(rnd() * 64);
      const rank = Math.floor(i / 8);
      if (board[i]) continue;
      if (piece === 'p' && (rank === 0 || rank === 7)) continue;
      board[i] = color === 'w' ? piece.toUpperCase() : piece;
      return true;
    }
    return false;
  };
  const pieces: [string, 'w' | 'b'][] = [
    ['k', strong],
    ['k', weak],
    ...[...mat.strong.toLowerCase()].map((p) => [p, strong] as [string, 'w' | 'b']),
    ...[...mat.weak.toLowerCase()].map((p) => [p, weak] as [string, 'w' | 'b']),
  ];
  for (const [p, c] of pieces) if (!place(p, c)) return null;

  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = board[rank * 8 + file];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += p;
      }
    }
    rows.push(row + (empty ? empty : ''));
  }
  const toMove = objective === 'win' ? strong : weak;
  const other = toMove === 'w' ? 'b' : 'w';
  const fen = `${rows.join('/')} ${toMove} - - 0 1`;
  // Le camp qui n'a PAS le trait ne doit pas être en échec (sinon position impossible).
  const flipped = `${rows.join('/')} ${other} - - 0 1`;
  if (!isValidFen(fen) || !isValidFen(flipped) || isInCheck(flipped)) return null;
  if (subcategoryOf(fen, familyOf(fen)) !== sub) return null;
  return fen;
}

/** Coups qui atteignent l'objectif pour le camp au trait. */
export function goodMoves(pos: TbPosition, objective: Objective): TbMove[] {
  return pos.moves.filter((m) => {
    const o = outcomeAfterMove(m);
    return objective === 'win' ? o === 'win' : o === 'draw' || o === 'win';
  });
}

/** La position est-elle un bon point de départ (résultat visé, un seul coup juste) ? */
export function isPuzzleStart(pos: TbPosition, objective: Objective): boolean {
  const result = outcomeOf(pos.category);
  if (objective === 'win' ? result !== 'win' : result !== 'draw') return false;
  if (pos.moves.length < 2) return false;
  return goodMoves(pos, objective).length === 1;
}

export interface Line {
  solution: string[]; // UCI, coup du joueur d'abord, puis alternance
  playerMoves: number;
}

/** Construit la ligne de solution tant que le coup juste reste unique. */
export async function buildLine(fen: string, objective: Objective, lookup: Lookup, maxPlayerMoves = 6): Promise<Line | null> {
  const solution: string[] = [];
  let cur = fen;
  let playerMoves = 0;
  while (playerMoves < maxPlayerMoves) {
    const pos = await lookup(cur);
    const good = goodMoves(pos, objective);
    if (good.length !== 1 || pos.moves.length < 2) break;
    const mine = good[0];
    const after = applyUci(cur, mine.uci);
    if (!after) return null;
    solution.push(mine.uci);
    playerMoves++;
    if (mine.checkmate || mine.stalemate || mine.insufficient_material) break;
    const reply = chooseDefense(await lookup(after.fen));
    if (!reply) break;
    const next = applyUci(after.fen, reply.uci);
    if (!next) return null;
    solution.push(reply.uci);
    cur = next.fen;
  }
  return playerMoves > 0 ? { solution, playerMoves } : null;
}

export interface RatingFeatures {
  sub: string;
  objective: Objective;
  playerMoves: number;
  /** Distance au gain (DTZ, en demi-coups) de la position de départ, si connue. */
  dtz: number | null;
  /** Nombre de coups légaux au départ. */
  legalMoves: number;
  /** Le coup juste est-il « naturel » (poussée de pion, prise, échec) ? */
  naturalMove: boolean;
}

const BASE: Record<string, number> = { 'kp-k': 700, 'k2p-k': 800, 'bp-b': 1100, 'b2p-b': 1200 };

/**
 * Elo ESTIMÉ (règle simple et documentée, à recalibrer avec les résultats réels) :
 * base du sous-thème, + 110 par coup de solution au-delà du 1er, + 150 si le coup
 * juste n'est pas naturel, + 100 pour une défense, + 4 × min(DTZ, 60),
 * + 5 par coup légal au-delà de 10 ; borné à 500–2300, arrondi à 10.
 */
export function estimateRating(f: RatingFeatures): number {
  let r = BASE[f.sub] ?? 1000;
  r += 110 * (f.playerMoves - 1);
  if (!f.naturalMove) r += 150;
  if (f.objective === 'draw') r += 100;
  if (f.dtz !== null) r += 4 * Math.min(Math.abs(f.dtz), 60);
  r += 5 * Math.max(0, f.legalMoves - 10);
  return Math.round(Math.min(2300, Math.max(500, r)) / 10) * 10;
}

export function isNaturalMove(fen: string, move: TbMove): boolean {
  const from = move.uci.slice(0, 2);
  const file = FILES.indexOf(from[0]);
  const rank = Number(from[1]) - 1;
  const rows = fen.split(' ')[0].split('/');
  let col = 0;
  let piece = '';
  for (const ch of rows[7 - rank]) {
    if (/\d/.test(ch)) col += Number(ch);
    else {
      if (col === file) piece = ch;
      col++;
    }
  }
  return piece.toLowerCase() === 'p' || move.san.includes('x') || move.san.includes('+');
}

