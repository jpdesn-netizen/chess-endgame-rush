import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMove, applyUci, isPromotionMove, isValidFen, legalDestinations } from '../src/core/chessRules';

const KQK = '8/8/8/4k3/8/8/8/3QK3 w - - 0 1';

test('FEN valides / invalides', () => {
  assert.equal(isValidFen(KQK), true);
  assert.equal(isValidFen('8/8/8/8/p7/8/8/4K3 w - - 0 1'), false); // pas de roi noir
});

test('cases légales du roi blanc en e1', () => {
  assert.deepEqual(legalDestinations(KQK, 'e1').sort(), ['d2', 'e2', 'f1', 'f2']);
});

test('un coup illégal renvoie null sans exception', () => {
  assert.equal(applyMove(KQK, 'e1', 'e3'), null);
  assert.equal(applyMove(KQK, 'a1', 'a2'), null);
});

test('coup légal : SAN, UCI et nouveau FEN', () => {
  const m = applyMove(KQK, 'd1', 'd7');
  assert.ok(m);
  assert.equal(m.san, 'Qd7');
  assert.equal(m.uci, 'd1d7');
  assert.equal(m.fen.split(' ')[1], 'b');
});

test('promotion détectée et appliquée (y compris sous-promotion)', () => {
  const fen = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1';
  assert.equal(isPromotionMove(fen, 'e7', 'e8'), true);
  const m = applyUci(fen, 'e7e8n');
  assert.ok(m);
  assert.equal(m.san, 'e8=N');
  assert.equal(m.uci, 'e7e8n');
});

test('mat et pat détectés', () => {
  const mate = applyMove('6k1/8/6K1/8/8/8/8/R7 w - - 0 1', 'a1', 'a8');
  assert.equal(mate?.isCheckmate, true);
  const stale2 = applyMove('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', 'g1', 'g6');
  assert.equal(stale2?.isStalemate, true);
});
