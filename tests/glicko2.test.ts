import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateRating } from '../src/core/glicko2';
import { ratingsByKey } from '../src/core/playerRating';

test('Glicko-2 : exemple chiffré de l’article de Glickman', () => {
  const out = updateRating({ r: 1500, rd: 200, vol: 0.06 }, [
    { r: 1400, rd: 30, s: 1 },
    { r: 1550, rd: 100, s: 0 },
    { r: 1700, rd: 300, s: 0 },
  ], 0.5);
  // L'article affiche 1464,06 / 151,52 / 0,05999 en arrondissant ses calculs intermédiaires ;
  // le calcul exact donne 1464,0507 / 151,5165 / 0,059996.
  assert.ok(Math.abs(out.r - 1464.06) < 0.011, String(out.r));
  assert.ok(Math.abs(out.rd - 151.52) < 0.01, String(out.rd));
  assert.ok(Math.abs(out.vol - 0.05999) < 0.00001, String(out.vol));
});

test('Elo personnel : monte en réussissant des puzzles difficiles, première tentative seulement', () => {
  const T = 1_790_000_000_000;
  const A = (i: number, p: string, r: number, ok: boolean, m = 'storm') => ({ t: T + i, m, p, r, c: 'rp-r', f: 'tours', ok });
  // 2 réussites sur 3 contre des puzzles de 1500 à 1900
  const attempts = Array.from({ length: 30 }, (_, i) => A(i, `p${i}`, 1500 + (i % 5) * 100, i % 3 !== 0));
  const map = ratingsByKey(attempts);
  const all = map.get('all')!;
  assert.ok(all.r > 1700 && all.r < 1950, `obtenu ${all.r}`);
  assert.equal(all.games, 30);
  assert.equal(all.provisional, false);
  assert.equal(map.get('f:tours')!.r, all.r);
  // Rejouer ou réviser un puzzle ne change rien
  const again = ratingsByKey([...attempts, A(100, 'p0', 1800, false), A(101, 'p1', 1800, false, 'review')]);
  assert.equal(again.get('all')!.r, all.r);
  // Peu de parties : provisoire
  assert.equal(ratingsByKey(attempts.slice(0, 2)).get('all')!.provisional, true);
});
