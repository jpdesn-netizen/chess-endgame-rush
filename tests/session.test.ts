import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMove } from '../src/core/chessRules';
import type { ModeRules } from '../src/core/config';
import type { Verdict } from '../src/core/judge/tablebaseJudge';
import { initialSession, sessionReducer, type SessionState } from '../src/core/session/puzzleSession';
import type { Puzzle } from '../src/core/types';

const RULES: ModeRules = { maxPlayerMoves: null, drawHoldMoves: 2, hardCapMoves: 50 };

const puzzle = (fen: string, objective: Puzzle['objective']): Puzzle => ({
  id: 't',
  title: 't',
  fen,
  objective,
  collection: 'bases',
  level: 'debutant',
  rating: 500,
  concept: '',
});

const good = (san: string): Verdict => ({ kind: 'good', san, outcome: 'win', isBest: true, verified: true });

function play(state: SessionState, from: string, to: string, verdict: Verdict): SessionState {
  const m = applyMove(state.fen, from, to);
  assert.ok(m, `${from}${to} doit être légal`);
  const s = sessionReducer(state, { type: 'PLAYER_MOVED', move: m });
  assert.equal(s.phase, 'judging');
  return sessionReducer(s, { type: 'VERDICT', verdict });
}

test('mauvais coup → échec immédiat', () => {
  const s0 = initialSession(puzzle('8/8/8/4k3/8/8/8/3QK3 w - - 0 1', 'win'), RULES);
  const bad: Verdict = { kind: 'bad', san: 'Qd6+', reason: 'throws-win', outcome: 'draw', bestMoves: ['Qd7'], bestUci: ['d1d7'] };
  const s = play(s0, 'd1', 'd6', bad);
  assert.equal(s.phase, 'failed');
  assert.equal(s.endReason, 'bad-move');
});

test('bon coup → réponse adverse → au joueur', () => {
  const s0 = initialSession(puzzle('8/8/8/4k3/8/8/8/3QK3 w - - 0 1', 'win'), RULES);
  const s1 = play(s0, 'd1', 'd7', good('Qd7'));
  assert.equal(s1.phase, 'opponentThinking');
  const reply = applyMove(s1.fen, 'e5', 'e4');
  assert.ok(reply);
  const s2 = sessionReducer(s1, { type: 'OPPONENT_MOVED', move: reply });
  assert.equal(s2.phase, 'awaitingPlayer');
  assert.equal(s2.moves.length, 2);
});

test('mat du joueur → réussite', () => {
  const s0 = initialSession(puzzle('6k1/8/6K1/8/8/8/8/R7 w - - 0 1', 'win'), RULES);
  const s = play(s0, 'a1', 'a8', good('Ra8#'));
  assert.equal(s.phase, 'solved');
  assert.equal(s.endReason, 'checkmate');
});

test('objectif nulle : tenir N coups → réussite', () => {
  const s0 = initialSession(puzzle('8/8/3k4/8/3PK3/8/8/8 b - - 0 1', 'draw'), RULES);
  const s1 = play(s0, 'd6', 'e6', good('Ke6'));
  assert.equal(s1.phase, 'opponentThinking');
  const r = applyMove(s1.fen, 'e4', 'f4');
  assert.ok(r);
  const s2 = sessionReducer(s1, { type: 'OPPONENT_MOVED', move: r });
  const s3 = play(s2, 'e6', 'f6', good('Kf6'));
  assert.equal(s3.phase, 'solved');
  assert.equal(s3.endReason, 'held-draw');
});

test('Storm/Streak : limite de coups atteinte avec le gain conservé → réussite', () => {
  const s0 = initialSession(puzzle('8/8/8/4k3/8/8/8/3QK3 w - - 0 1', 'win'), { ...RULES, maxPlayerMoves: 1 });
  const s = play(s0, 'd1', 'd7', good('Qd7'));
  assert.equal(s.phase, 'solved');
  assert.equal(s.endReason, 'still-winning');
});

test('un coup joué hors de son tour est ignoré', () => {
  const s0 = initialSession(puzzle('8/8/8/4k3/8/8/8/3QK3 w - - 0 1', 'win'), RULES);
  const s1 = play(s0, 'd1', 'd7', good('Qd7'));
  const m = applyMove(s1.fen, 'e5', 'e4');
  assert.ok(m);
  assert.equal(sessionReducer(s1, { type: 'PLAYER_MOVED', move: m }), s1);
});

test('RESET revient à la position de départ', () => {
  const s0 = initialSession(puzzle('8/8/8/4k3/8/8/8/3QK3 w - - 0 1', 'win'), RULES);
  const s1 = play(s0, 'd1', 'd7', good('Qd7'));
  const s2 = sessionReducer(s1, { type: 'RESET' });
  assert.equal(s2.fen, s0.fen);
  assert.equal(s2.phase, 'awaitingPlayer');
});
