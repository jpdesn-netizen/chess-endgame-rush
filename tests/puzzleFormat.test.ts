import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodePuzzles, encodePuzzles, pieceCount, readPuzzleFile, type RawPuzzle } from '../src/data/puzzleFormat';

const SAMPLE: RawPuzzle[] = [
  {
    id: 'lichess-0YIbP',
    fen: '4k3/4P3/4KPn1/8/8/8/8/8 w - - 3 73',
    lastMove: 'h4g6',
    solution: ['f6f7'],
    rating: 399,
    objective: 'win',
    family: 'cavaliers',
    pieces: 5,
    themes: ['advancedPawn', 'knightEndgame', 'mate', 'mateIn1'],
    gameUrl: 'https://lichess.org/6mdgMIxn/black#144',
  },
  {
    id: 'lichess-abcde',
    fen: '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1',
    lastMove: 'd5e5',
    solution: ['e1d2', 'e5d4', 'e2e3'],
    rating: 1650,
    objective: 'draw',
    family: 'pions',
    pieces: 3,
    themes: ['pawnEndgame'],
    gameUrl: 'https://lichess.org/AbCdEfGh#61',
  },
];

test('format compact : aller-retour sans perte', () => {
  assert.deepEqual(decodePuzzles(encodePuzzles(SAMPLE)), SAMPLE);
});

test('format compact : lecture des deux formats', () => {
  assert.deepEqual(readPuzzleFile({ puzzles: SAMPLE }), SAMPLE);
  assert.deepEqual(readPuzzleFile(JSON.parse(JSON.stringify(encodePuzzles(SAMPLE)))), SAMPLE);
  assert.throws(() => readPuzzleFile({}));
});

test('format compact : nombre de pièces tiré du FEN', () => {
  assert.equal(pieceCount('4k3/4P3/4KPn1/8/8/8/8/8 w - - 3 73'), 5);
});

test('fichier livré : lisible et complet', { skip: !existsSync('public/data/lichess-endgames.json') }, () => {
  const puzzles = readPuzzleFile(JSON.parse(readFileSync('public/data/lichess-endgames.json', 'utf8')));
  assert.ok(puzzles.length >= 10_000);
  assert.equal(new Set(puzzles.map((p) => p.id)).size, puzzles.length);
  for (const p of puzzles) {
    assert.match(p.id, /^lichess-/);
    assert.ok(p.solution.length > 0 && p.family && p.gameUrl.startsWith('https://lichess.org/'));
  }
});
