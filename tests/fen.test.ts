import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countPieces, fenToPieces, parseUci, positionKey, sideToMove } from '../src/core/fen';

test('sideToMove lit le trait', () => {
  assert.equal(sideToMove('8/8/8/8/8/8/8/K6k w - - 0 1'), 'w');
  assert.equal(sideToMove('8/8/8/8/8/8/8/K6k b - - 0 1'), 'b');
});

test('fenToPieces place correctement les pièces', () => {
  const pieces = fenToPieces('1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1');
  const byType = Object.fromEntries(pieces.map((p) => [p.square, `${p.color}${p.type}`]));
  assert.deepEqual(byType, { b8: 'wk', d8: 'bk', b7: 'wp', a2: 'br', c1: 'wr' });
  assert.equal(countPieces('1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1'), 5);
});

test('fenToPieces rejette un FEN mal formé', () => {
  assert.throws(() => fenToPieces('8/8/8 w - - 0 1'));
  assert.throws(() => fenToPieces('9/8/8/8/8/8/8/8 w - - 0 1'));
});

test('positionKey ignore les compteurs de coups', () => {
  assert.equal(positionKey('8/8/8/8/8/8/8/K6k w - - 12 40'), positionKey('8/8/8/8/8/8/8/K6k w - - 0 1'));
});

test('parseUci gère la promotion', () => {
  assert.deepEqual(parseUci('e7e8n'), { from: 'e7', to: 'e8', promotion: 'n' });
  assert.deepEqual(parseUci('a1a2'), { from: 'a1', to: 'a2', promotion: undefined });
});
