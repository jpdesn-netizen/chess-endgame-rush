import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidFen } from '../src/core/chessRules';
import { CONFIG } from '../src/core/config';
import { countPieces } from '../src/core/fen';
import { PUZZLES_MOCK } from '../src/data/puzzlesMock';

test('au moins 10 puzzles (cahier des charges §6)', () => {
  assert.ok(PUZZLES_MOCK.length >= 10);
});

test('identifiants uniques', () => {
  const ids = PUZZLES_MOCK.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

for (const p of PUZZLES_MOCK) {
  test(`${p.id} : FEN légal et jugeable par la table (≤ ${CONFIG.tablebase.maxPieces} pièces)`, () => {
    assert.equal(isValidFen(p.fen), true);
    assert.ok(countPieces(p.fen) <= CONFIG.tablebase.maxPieces);
  });
}
