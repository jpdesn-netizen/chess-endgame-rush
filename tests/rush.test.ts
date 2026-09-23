import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, rushRules } from '../src/core/config';
import { applyLineTolerance, isOnLine, preferLineReply } from '../src/core/judge/lineRules';
import type { Verdict } from '../src/core/judge/tablebaseJudge';
import { remainingMs, rushReducer, startRush, targetRating, type RushEntry } from '../src/core/rush/rushRules';
import { pickNext } from '../src/core/rush/selector';
import type { Puzzle } from '../src/core/types';
import { tbMove, tbPosition } from './fixtures';

const entry = (success: boolean): RushEntry => ({ puzzleId: 'x', rating: 1000, success, title: 't' });
const { durationMs, bonusMs, penaltyMs } = CONFIG.modes.storm;
const go = (s: ReturnType<typeof startRush>) => rushReducer(s, { type: 'START', now: 0 });

test('Storm : le chrono attend le premier coup', () => {
  const s0 = startRush('storm', 800);
  assert.equal(s0.status, 'waiting');
  assert.equal(rushReducer(s0, { type: 'TICK', now: 10 * durationMs }).status, 'waiting');
  assert.equal(remainingMs(s0, 999_999), durationMs);
  const s1 = rushReducer(s0, { type: 'START', now: 5_000 });
  assert.equal(s1.status, 'running');
  assert.equal(remainingMs(s1, 5_000), durationMs);
});

test('Storm : +1 point et bonus de temps par réussite', () => {
  const s0 = go(startRush('storm', 800));
  const s1 = rushReducer(s0, { type: 'SOLVED', now: 1000, entry: entry(true) });
  assert.equal(s1.score, 1);
  assert.equal(s1.combo, 1);
  assert.equal(remainingMs(s1, 1000), durationMs - 1000 + bonusMs);
});

test('Storm : pénalité de temps par erreur, combo remis à zéro', () => {
  let s = go(startRush('storm', 800));
  s = rushReducer(s, { type: 'SOLVED', now: 10, entry: entry(true) });
  s = rushReducer(s, { type: 'FAILED', now: 20, entry: entry(false) });
  assert.equal(s.errors, 1);
  assert.equal(s.combo, 0);
  assert.equal(s.bestCombo, 1);
  assert.equal(s.status, 'running');
  assert.equal(remainingMs(s, 20), durationMs + bonusMs - penaltyMs - 20);
});

test('Storm : fin quand le temps est écoulé, puis état figé', () => {
  const s0 = go(startRush('storm', 800));
  const over = rushReducer(s0, { type: 'TICK', now: durationMs });
  assert.equal(over.status, 'over');
  assert.equal(rushReducer(over, { type: 'SOLVED', now: durationMs + 1, entry: entry(true) }).score, 0);
});

test('Storm : une pénalité qui vide le chrono termine la partie', () => {
  const s0 = go(startRush('storm', 800));
  const s = rushReducer(s0, { type: 'FAILED', now: durationMs - 5_000, entry: entry(false) });
  assert.equal(s.status, 'over');
});

test('Streak : la difficulté monte à chaque réussite, fin à la 1re erreur', () => {
  let s = go(startRush('streak', 1200));
  assert.equal(s.endsAt, null);
  s = rushReducer(s, { type: 'SOLVED', now: 1, entry: entry(true) });
  s = rushReducer(s, { type: 'SOLVED', now: 2, entry: entry(true) });
  assert.equal(targetRating(s), 1200 + 2 * CONFIG.modes.streak.eloStep);
  s = rushReducer(s, { type: 'FAILED', now: 3, entry: entry(false) });
  assert.equal(s.status, 'over');
  assert.equal(s.score, 2);
});

const P = (id: string, rating: number) => ({ id, rating }) as Puzzle;

test('sélection : proche de l’Elo visé, jamais deux fois le même', () => {
  const pool = [P('a', 600), P('b', 1000), P('c', 1050), P('d', 2000)];
  const first = pickNext(pool, 1000, new Set(), () => 0);
  assert.equal(first?.id, 'b');
  const second = pickNext(pool, 1000, new Set(['b']), () => 0);
  assert.equal(second?.id, 'c');
  assert.equal(pickNext(pool, 1000, new Set(['a', 'b', 'c', 'd'])), null);
});

test('rushRules : longueur de la ligne Lichess, plafonnée à 6 coups', () => {
  assert.equal(rushRules(['a', 'b', 'c']).maxPlayerMoves, 2);
  assert.equal(rushRules(new Array(20).fill('x')).maxPlayerMoves, 6);
  assert.equal(rushRules(undefined).maxPlayerMoves, 6);
});

test('ligne Lichess : le coup de la partie n’est jamais refusé pour lenteur', () => {
  const slow: Verdict = { kind: 'bad', san: 'Kb2', reason: 'too-slow', outcome: 'win', extraMoves: 12, bestMoves: [], bestUci: [] };
  const solution = ['a1b1', 'c3d3', 'b1b2'];
  assert.equal(isOnLine(['a1b1', 'c3d3'], solution), true);
  assert.equal(applyLineTolerance(slow, 'b1b2', ['a1b1', 'c3d3'], solution).kind, 'good');
  assert.equal(applyLineTolerance(slow, 'b1c2', ['a1b1', 'c3d3'], solution).kind, 'bad');
  const lost: Verdict = { ...slow, reason: 'throws-win', outcome: 'draw' };
  assert.equal(applyLineTolerance(lost, 'b1b2', ['a1b1', 'c3d3'], solution).kind, 'bad');
});

test('ligne Lichess : l’adversaire rejoue le coup de la partie s’il est aussi bon', () => {
  const pos = tbPosition('loss', [tbMove('e5f5', 'Kf5', 'win', 25), tbMove('e5e6', 'Ke6', 'win', 11), tbMove('e5d4', 'Kd4', 'draw', 0)]);
  const best = pos.moves[2];
  assert.equal(preferLineReply(pos, best, ['a1a2'], ['a1a2', 'e5e6']).uci, 'e5d4'); // la ligne perd, la table garde la nulle
  const pos2 = tbPosition('loss', [tbMove('e5f5', 'Kf5', 'win', 25), tbMove('e5e6', 'Ke6', 'win', 11)]);
  assert.equal(preferLineReply(pos2, pos2.moves[0], ['a1a2'], ['a1a2', 'e5e6']).uci, 'e5e6');
});
