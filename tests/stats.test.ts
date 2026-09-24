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

// --- Records façon Lichess ---
import { periodRecords, periodStarts, recentRuns } from '../src/core/stats';

test('records par période : jour, semaine (lundi), mois, absolu — sans cumul', () => {
  const now = new Date(2026, 8, 24, 18, 0).getTime(); // jeudi 24/09/2026
  const at = (d: number, h = 12) => new Date(2026, 8, d, h).getTime();
  const R = (t: number, score: number, mode = 'storm', theme = 'mix') => ({ t, mode, theme, score });
  const runs = [
    R(new Date(2026, 7, 30).getTime(), 30), // août : record absolu
    R(at(3), 12), // ce mois
    R(at(21), 15), // lundi de cette semaine
    R(at(24, 9), 9), // aujourd'hui
    R(at(24, 10), 11), // aujourd'hui, meilleur
    R(at(24, 11), 40, 'streak'), // autre mode : ignoré
  ];
  const s = periodStarts(now);
  assert.equal(new Date(s.week).getDate(), 21);
  const rec = periodRecords(runs, 'storm', now);
  assert.deepEqual([rec.today?.score, rec.week?.score, rec.month?.score, rec.all?.score], [11, 15, 15, 30]);
  assert.equal(periodRecords([], 'storm', now).all, null);
  // Filtre par thème
  assert.equal(periodRecords([...runs, R(at(24, 12), 5, 'storm', 'tours')], 'storm', now, 'tours').all?.score, 5);
});

test('sessions récentes : ordre antichronologique et limite', () => {
  const runs = [1, 5, 3, 4, 2].map((t) => ({ t, mode: 'streak', theme: 'mix', score: t }));
  assert.deepEqual(recentRuns(runs, 'streak', 3).map((r) => r.t), [5, 4, 3]);
  assert.equal(recentRuns(runs, 'storm').length, 0);
});

// --- Tableau de bord et profil par type ---
import { dailyBest, runAccuracy, typeProfile } from '../src/core/stats';

test('meilleur essai du jour + nombre d’essais', () => {
  const at = (d: number, h: number) => new Date(2026, 8, d, h).getTime();
  const runs = [
    { t: at(22, 9), mode: 'storm', theme: 'mix', score: 12 },
    { t: at(22, 18), mode: 'storm', theme: 'mix', score: 16 },
    { t: at(22, 20), mode: 'storm', theme: 'mix', score: 16 }, // égalité : le premier garde la place
    { t: at(20, 10), mode: 'storm', theme: 'tours', score: 8 },
    { t: at(20, 11), mode: 'streak', theme: 'mix', score: 30 },
  ];
  const d = dailyBest(runs, 'storm');
  assert.deepEqual(d.map((x) => [new Date(x.day).getDate(), x.best.score, x.count]), [[22, 16, 3], [20, 8, 1]]);
  assert.equal(d[0].best.t, at(22, 18));
  assert.equal(dailyBest(runs, 'storm', 'tours').length, 1);
});

test('précision façon Lichess : coups justes / coups joués', () => {
  assert.equal(runAccuracy({ t: 0, mode: 'storm', theme: 'mix', score: 16, moves: 32, errors: 2 }), 30 / 32);
  assert.equal(runAccuracy({ t: 0, mode: 'storm', theme: 'mix', score: 16 }), null); // ancienne partie
});

test('profil par famille : 6 familles, précision, niveau atteint, bute vers', () => {
  const A = (f: string, c: string, r: number, ok: boolean) => ({ t: 1, m: 'storm', f, c, r, ok });
  const p = typeProfile([A('tours', 'rp-r', 1200, true), A('tours', 'rp-r', 1500, true), A('tours', 'r-p', 1700, false), A('pions', 'kp-k', 900, false)], 'family');
  assert.deepEqual(p.map((s) => s.id), ['pions', 'tours', 'dames', 'fous', 'cavaliers', 'mixte']);
  const tours = p.find((s) => s.id === 'tours')!;
  assert.deepEqual([tours.attempts, tours.success, tours.maxSolved, tours.avgFailed], [3, 2, 1500, 1700]);
  assert.equal(p.find((s) => s.id === 'pions')!.maxSolved, null);
  assert.equal(p.find((s) => s.id === 'dames')!.attempts, 0);
  // Sous-thèmes d'une famille
  const sub = typeProfile([A('tours', 'rp-r', 1200, true), A('tours', 'r-p', 1700, false)], 'tours');
  assert.equal(sub.find((s) => s.id === 'rp-r')!.rate, 1);
  assert.ok(sub.every((s) => s.family === 'tours'));
});
