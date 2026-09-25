import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dueNow, MASTERED_AFTER, reviewItems } from '../src/core/review';

const D = 86_400_000;
const T0 = 1_790_000_000_000;
const A = (p: string, day: number, ok: boolean) => ({ p, t: T0 + day * D, ok });

test('seules les erreurs entrent en révision', () => {
  const items = reviewItems([A('ok1', 0, true), A('ok1', 1, true), A('ko', 0, false)]);
  assert.deepEqual(items.map((i) => i.id), ['ko']);
  assert.equal(items[0].due, T0 + 1 * D); // à revoir le lendemain
});

test('intervalles croissants, remise à zéro sur échec, acquis après 4 réussites', () => {
  let h = [A('x', 0, false), A('x', 1, true)];
  assert.equal(reviewItems(h)[0].due, T0 + 1 * D + 3 * D);
  h = [...h, A('x', 4, true)];
  assert.equal(reviewItems(h)[0].due, T0 + 4 * D + 7 * D);
  assert.equal(reviewItems([...h, A('x', 11, false)])[0].streak, 0); // nouvel échec
  const mastered = [A('y', 0, false), ...Array.from({ length: MASTERED_AFTER }, (_, i) => A('y', i + 1, true))];
  assert.equal(reviewItems(mastered).length, 0);
});

test('à revoir maintenant, du plus urgent au moins urgent', () => {
  const items = reviewItems([A('a', 0, false), A('b', 5, false), A('c', 2, false)]);
  assert.deepEqual(items.map((i) => i.id), ['a', 'c', 'b']);
  assert.deepEqual(dueNow(items, T0 + 3.5 * D).map((i) => i.id), ['a', 'c']);
});

test('révision : un échec en position jouée jusqu’au bout est rejoué jusqu’au bout', () => {
  const items = reviewItems([{ p: 'z', t: T0, ok: false, m: 'training' }, { p: 'w', t: T0, ok: false, m: 'storm' }]);
  assert.equal(items.find((i) => i.id === 'z')!.full, true);
  assert.equal(items.find((i) => i.id === 'w')!.full, false);
});
