import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderedCounts, subcategoryOf } from '../src/core/categories';
import { filterAttempts, scoreSeries, statsByCategory, totals, weaknesses } from '../src/core/stats';

test('sous-catégories : camp fort d’abord, quel que soit le trait', () => {
  assert.equal(subcategoryOf('1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1'), 'rp-r'); // Lucena
  assert.equal(subcategoryOf('4k3/7R/r7/3PK3/8/8/8/8 b - - 0 1'), 'rp-r'); // Philidor (Noirs au trait, plus faibles)
  assert.equal(subcategoryOf('8/8/4k3/8/4K3/8/4P3/8 w - - 0 1'), 'kp-k');
  assert.equal(subcategoryOf('8/8/8/8/1K6/8/3pk3/7Q w - - 0 1'), 'q-p');
  assert.equal(subcategoryOf('8/8/8/8/8/2k5/3p4/K2R4 w - - 0 1'), 'r-p');
  assert.equal(subcategoryOf('8/8/8/4k3/8/8/8/3QK3 w - - 0 1'), 'dames-autres');
  assert.equal(subcategoryOf('8/5p2/4k3/8/8/2N5/4K3/3r4 w - - 0 1'), 'r-n');
});

test('matériel ordonné', () => {
  const { strong, weak } = orderedCounts('4k3/7R/r7/3PK3/8/8/8/8 b - - 0 1');
  assert.deepEqual([strong.r, strong.p, weak.r, weak.p], [1, 1, 1, 0]);
});

const A = (c: string, ok: boolean, m = 'storm', f = 'tours', t = 1000, r = 1200) => ({ t, m, r, c, f, ok });

test('statistiques par sous-thème et points faibles', () => {
  const attempts = [
    ...Array.from({ length: 6 }, (_, i) => A('rp-r', i < 2)), // 33 %
    ...Array.from({ length: 5 }, (_, i) => A('r-p', i < 4)), // 80 %
    A('q-p', false, 'storm', 'dames'), // trop peu de tentatives
  ];
  const stats = statsByCategory(attempts);
  const w = weaknesses(stats, 5);
  assert.deepEqual(w.map((s) => s.id), ['rp-r', 'r-p']);
  assert.equal(Math.round(w[0].rate * 100), 33);
  assert.equal(w[0].label, '♖♙ vs ♜');
  assert.equal(statsByCategory([A('tours-autres', true)])[0].label, 'Autres (tours)');
  assert.equal(totals(attempts).attempts, 12);
});

test('filtres : mode, famille, période', () => {
  const attempts = [A('rp-r', true, 'storm', 'tours', 100), A('q-p', true, 'streak', 'dames', 200), A('kp-k', false, 'storm', 'pions', 300)];
  assert.equal(filterAttempts(attempts, { mode: 'storm' }).length, 2);
  assert.equal(filterAttempts(attempts, { family: 'dames' }).length, 1);
  assert.equal(filterAttempts(attempts, { sinceMs: 150 }).length, 2);
});

test('série de scores chronologique par mode', () => {
  const runs = [
    { t: 3, mode: 'storm', theme: 'mix', score: 12 },
    { t: 1, mode: 'storm', theme: 'mix', score: 8 },
    { t: 2, mode: 'streak', theme: 'mix', score: 5 },
  ];
  assert.deepEqual(scoreSeries(runs, 'storm').map((p) => p.score), [8, 12]);
});
