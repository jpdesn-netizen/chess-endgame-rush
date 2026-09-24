import assert from 'node:assert/strict';
import { test } from 'node:test';
import { subcategoryOf } from '../src/core/categories';
import { isInCheck, isValidFen } from '../src/core/chessRules';
import type { TbPosition } from '../src/core/judge/tablebaseTypes';
import { buildLine, estimateRating, isNaturalMove, isPuzzleStart, MATERIAL, randomPosition } from '../scripts/lib/tbGenerator';
import { tbMove, tbPosition } from './fixtures';

const seeded = (seed: number) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

test('génération : positions légales, bon matériel, bon camp au trait', () => {
  const rnd = seeded(7);
  for (const sub of Object.keys(MATERIAL)) {
    let ok = 0;
    for (let i = 0; i < 400 && ok < 50; i++) {
      const objective = i % 3 ? 'win' : 'draw';
      const fen = randomPosition(sub, objective, rnd);
      if (!fen) continue;
      ok++;
      assert.ok(isValidFen(fen), fen);
      assert.equal(subcategoryOf(fen), sub, fen);
      const [placement, turn] = fen.split(' ');
      const other = turn === 'w' ? 'b' : 'w';
      assert.equal(isInCheck(`${placement} ${other} - - 0 1`), false, `camp sans le trait en échec : ${fen}`);
      // Gain : c'est le camp fort (celui qui a des pions en plus) qui joue.
      const pawns = (c: string) => [...placement].filter((x) => x === c).length;
      const strongIsWhite = pawns('P') > pawns('p');
      assert.equal(turn === 'w', objective === 'win' ? strongIsWhite : !strongIsWhite, fen);
    }
    assert.ok(ok >= 50, `${sub} : trop de tirages ratés`);
  }
});

test('départ d’exercice : résultat visé et UN SEUL coup juste', () => {
  const unique = tbPosition('win', [tbMove('e1d2', 'Kd2', 'loss', 20), tbMove('e2e4', 'e4', 'draw', 0)]);
  const two = tbPosition('win', [tbMove('e1d2', 'Kd2', 'loss', 20), tbMove('e1f2', 'Kf2', 'loss', 22)]);
  assert.equal(isPuzzleStart(unique, 'win'), true);
  assert.equal(isPuzzleStart(two, 'win'), false);
  assert.equal(isPuzzleStart(unique, 'draw'), false);
  const defend = tbPosition('draw', [tbMove('e8d8', 'Kd8', 'draw', 0), tbMove('e8f8', 'Kf8', 'win', 15)]);
  assert.equal(isPuzzleStart(defend, 'draw'), true);
  assert.equal(isPuzzleStart(tbPosition('win', [tbMove('e1d2', 'Kd2', 'loss', 20)]), 'win'), false); // coup forcé
});

test('ligne : continue tant que le coup juste est unique, défense la plus résistante', async () => {
  const start = '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1';
  const table: Record<string, TbPosition> = {
    [start]: tbPosition('win', [tbMove('e1d2', 'Kd2', 'loss', 20), tbMove('e2e4', 'e4', 'draw', 0)]),
    '8/8/8/4k3/8/8/3KP3/8 b - - 1 1': tbPosition('loss', [tbMove('e5d5', 'Kd5', 'win', 19), tbMove('e5e4', 'Ke4', 'win', 9)]),
  };
  const lookup = async (fen: string) =>
    table[fen] ?? tbPosition('win', [tbMove('d2d3', 'Kd3', 'loss', 15), tbMove('d2e3', 'Ke3', 'loss', 16)]);
  const line = await buildLine(start, 'win', lookup);
  assert.deepEqual(line, { solution: ['e1d2', 'e5d5'], playerMoves: 1 }); // défense : la plus longue résistance (Kd5)
});

test('Elo estimé : borné, plus difficile quand la solution est longue ou peu naturelle', () => {
  const f = { sub: 'kp-k', objective: 'win' as const, playerMoves: 1, dtz: 10, legalMoves: 8, naturalMove: true };
  const easy = estimateRating(f);
  assert.ok(estimateRating({ ...f, playerMoves: 4 }) > easy);
  assert.ok(estimateRating({ ...f, naturalMove: false }) > easy);
  assert.ok(estimateRating({ ...f, objective: 'draw' }) > easy);
  assert.equal(estimateRating({ ...f, playerMoves: 50 }), 2300);
  assert.equal(easy % 10, 0);
  assert.equal(isNaturalMove('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1', tbMove('e2e4', 'e4', 'draw', 0)), true);
  assert.equal(isNaturalMove('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1', tbMove('e1d2', 'Kd2', 'loss', 20)), false);
});
