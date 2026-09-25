import assert from 'node:assert/strict';
import { test } from 'node:test';
import { badges, dailyPick, dayStreak } from '../src/core/motivation';

const at = (d: number, h = 12) => new Date(2026, 8, d, h).getTime();

test('série de jours : en cours, meilleure, et encore vivante si pas joué aujourd’hui', () => {
  const acts = [at(1), at(2), at(3), at(10), at(11), at(11, 20)].map((t) => ({ t }));
  assert.deepEqual(dayStreak(acts, at(12)), { current: 2, best: 3, playedToday: false });
  assert.deepEqual(dayStreak(acts, at(11, 22)), { current: 2, best: 3, playedToday: true });
  assert.equal(dayStreak(acts, at(13)).current, 0); // un jour sauté : série perdue
});

test('puzzle du jour : identique toute la journée, change d’un jour à l’autre, Elo 1200-1900', () => {
  const pool = Array.from({ length: 300 }, (_, i) => ({ id: `p${i}`, rating: 800 + i * 5 }));
  const a = dailyPick(pool, at(5, 8))!;
  assert.equal(dailyPick(pool, at(5, 23))!.id, a.id);
  assert.ok(a.rating >= 1200 && a.rating <= 1900);
  const ids = new Set([1, 2, 3, 4, 5, 6, 7].map((d) => dailyPick(pool, at(d))!.id));
  assert.ok(ids.size >= 5);
  assert.equal(dailyPick([], at(1)), null);
});

test('badges : obtenus selon l’historique', () => {
  const acts = Array.from({ length: 100 }, (_, i) => ({ t: i, m: 'storm', p: `p${i}`, r: 1500, f: 'tours', ok: true }));
  const list = badges(acts, [{ mode: 'storm', score: 16 }], { current: 1, best: 7, playedToday: true }, undefined);
  const got = (id: string) => list.find((b) => b.id === id)!.earned;
  assert.equal(got('first'), true);
  assert.equal(got('100'), true);
  assert.equal(got('1000'), false);
  assert.equal(got('storm15'), true);
  assert.equal(got('days7'), true);
  assert.equal(got('allfam'), false);
  assert.equal(list.find((b) => b.id === 'allfam')!.progress, '1/6');
});
