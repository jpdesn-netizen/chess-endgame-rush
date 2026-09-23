import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatScore, judgeByEngine, toCp } from '../src/core/judge/engineJudge';

const OPTIONS = { winThresholdCp: 200, drawThresholdCp: -50, toleranceCp: 100 };
const base = { san: 'Rd7', bestSan: 'Rc7', bestUci: 'c1c7', isCheckmate: false, options: OPTIONS } as const;

test('mat converti en très grande valeur, plus proche = plus fort', () => {
  assert.ok(toCp({ mate: 2 }) > toCp({ mate: 5 }));
  assert.ok(toCp({ mate: -2 }) < toCp({ cp: -900 }));
  assert.equal(toCp({ cp: 150 }), 150);
});

test('gain : un coup qui reste nettement gagnant est accepté', () => {
  // meilleur +5.0 ; après le coup, l'adversaire est à −3.1 (donc joueur +3.1)
  const v = judgeByEngine({ ...base, objective: 'win', best: { cp: 500 }, after: { cp: -310 } });
  assert.equal(v.kind, 'good');
});

test('gain : un coup qui ramène vers la nulle est refusé', () => {
  const v = judgeByEngine({ ...base, objective: 'win', best: { cp: 500 }, after: { cp: -40 } });
  assert.equal(v.kind, 'bad');
  assert.equal(v.kind === 'bad' && v.reason, 'throws-win');
  assert.deepEqual(v.kind === 'bad' && v.bestMoves, ['Rc7']);
});

test('gain : un coup perdant est refusé comme "perd"', () => {
  const v = judgeByEngine({ ...base, objective: 'win', best: { cp: 500 }, after: { cp: 400 } });
  assert.equal(v.kind === 'bad' && v.reason, 'loses');
});

test('gain : si la meilleure éval est modeste, tolérance relative', () => {
  // meilleur +1.5 : plancher = min(200, 150 − 100) = 50
  assert.equal(judgeByEngine({ ...base, objective: 'win', best: { cp: 150 }, after: { cp: -80 } }).kind, 'good');
  assert.equal(judgeByEngine({ ...base, objective: 'win', best: { cp: 150 }, after: { cp: 0 } }).kind, 'bad');
});

test('nulle : tenir est accepté, s’effondrer est refusé', () => {
  assert.equal(judgeByEngine({ ...base, objective: 'draw', best: { cp: 0 }, after: { cp: 20 } }).kind, 'good');
  const v = judgeByEngine({ ...base, objective: 'draw', best: { cp: 0 }, after: { cp: 350 } });
  assert.equal(v.kind === 'bad' && v.reason, 'loses');
});

test('mat donné : toujours accepté', () => {
  assert.equal(judgeByEngine({ ...base, objective: 'win', best: { mate: 1 }, after: { mate: 0 }, isCheckmate: true }).kind, 'good');
});

test('affichage des évaluations', () => {
  assert.equal(formatScore({ cp: 250 }), '+2.5');
  assert.equal(formatScore({ mate: 3 }), 'mat en 3');
});
