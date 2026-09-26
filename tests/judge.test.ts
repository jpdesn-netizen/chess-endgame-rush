import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outcomeAfterMove, outcomeOf } from '../src/core/judge/outcome';
import { correctMoves, judgeMove } from '../src/core/judge/tablebaseJudge';
import { tbMove, tbPosition } from './fixtures';

const OPTS = { slowMoveToleranceMoves: 10 };

test('catégories : cursed-win et blessed-loss comptent comme nulles', () => {
  assert.equal(outcomeOf('cursed-win'), 'draw');
  assert.equal(outcomeOf('blessed-loss'), 'draw');
  assert.equal(outcomeOf('syzygy-win'), 'win');
  // Catégorie d'un coup = point de vue adverse : "loss" = bon pour le joueur.
  assert.equal(outcomeAfterMove(tbMove('a1a2', 'Ra2', 'loss', -10)), 'win');
});

// Position gagnante : 1 coup optimal, 1 coup lent mais toléré, 1 trop lent, 1 qui annule.
const WIN = tbPosition(
  'win',
  [
    tbMove('d1d7', 'Qd7', 'loss', -12),
    tbMove('e1e2', 'Ke2', 'loss', -30), // +18 demi-coups = 9 coups : toléré
    tbMove('d1a1', 'Qa1', 'loss', -40), // +28 demi-coups = 14 coups : trop lent
    tbMove('d1d6', 'Qd6+', 'draw', 0),
  ],
  13,
);

test('le meilleur coup est bon et marqué "best"', () => {
  const v = judgeMove(WIN, 'd1d7', OPTS);
  assert.equal(v?.kind, 'good');
  assert.equal(v?.kind === 'good' && v.isBest, true);
});

test('un coup un peu plus lent reste accepté (tolérance 10 coups)', () => {
  const v = judgeMove(WIN, 'e1e2', OPTS);
  assert.equal(v?.kind, 'good');
  assert.equal(v?.kind === 'good' && v.isBest, false);
});

test('un coup beaucoup trop lent est refusé avec le retard en coups', () => {
  const v = judgeMove(WIN, 'd1a1', OPTS);
  assert.equal(v?.kind, 'bad');
  if (v?.kind !== 'bad') return;
  assert.equal(v.reason, 'too-slow');
  assert.equal(v.extraMoves, 14);
  assert.deepEqual(v.bestMoves, ['Qd7', 'Ke2', 'Qa1']);
});

test('laisser échapper le gain est refusé', () => {
  const v = judgeMove(WIN, 'd1d6', OPTS);
  assert.equal(v?.kind === 'bad' && v.reason, 'throws-win');
});

test('position nulle : tenir est bon, perdre est refusé', () => {
  const DRAW = tbPosition('draw', [tbMove('d6e6', 'Ke6', 'draw', 0), tbMove('d6c6', 'Kc6', 'win', 20)]);
  assert.equal(judgeMove(DRAW, 'd6e6', OPTS)?.kind, 'good');
  const bad = judgeMove(DRAW, 'd6c6', OPTS);
  assert.equal(bad?.kind === 'bad' && bad.reason, 'loses');
  assert.deepEqual(bad?.kind === 'bad' && bad.bestMoves, ['Ke6']);
});

test('DTZ : un coup de pion (remise à zéro) gagnant est toujours accepté', () => {
  const pos = tbPosition('win', [
    tbMove('e4d4', 'Kd4', 'loss', null, -5),
    tbMove('e2e3', 'e3', 'loss', null, -60, { zeroing: true }),
  ]);
  assert.equal(judgeMove(pos, 'e2e3', OPTS)?.kind, 'good');
});

test('un mat est toujours accepté', () => {
  const pos = tbPosition('win', [tbMove('a1a8', 'Ra8#', 'loss', 0, 0, { checkmate: true })], 1);
  assert.equal(judgeMove(pos, 'a1a8', OPTS)?.kind, 'good');
});

test('correctMoves trie les coups gagnants du plus rapide au plus lent', () => {
  assert.deepEqual(
    correctMoves(WIN).map((m) => m.san),
    ['Qd7', 'Ke2', 'Qa1'],
  );
});

test('coup inconnu de la table : null', () => {
  assert.equal(judgeMove(WIN, 'h1h8', OPTS), null);
});

test('mauvais coup : le meilleur coup indique « mat en N » quand la table donne la distance au mat', () => {
  const v = judgeMove(WIN, 'd1d6', OPTS);
  assert.equal(v?.kind, 'bad');
  // Qd7 : l'adversaire est maté en 12 demi-coups → mat en 12/2 + 1 = 7 coups.
  assert.equal(v?.kind === 'bad' && v.bestMateIn, 7);
});
