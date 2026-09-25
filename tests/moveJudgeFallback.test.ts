import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMoveJudge } from '../src/services/moveJudge';
import { TablebaseError, type TablebaseClient } from '../src/services/tablebaseClient';
import type { Engine } from '../src/services/stockfish';

const FEN = '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1'; // 3 pièces : normalement jugé par la table

const deadTable = (kind: 'rate-limited' | 'network' | 'bad-request'): TablebaseClient => ({
  lookup: async () => {
    throw new TablebaseError(kind, 'indisponible');
  },
  prefetch: () => undefined,
  paused: () => kind === 'rate-limited',
  stats: () => ({ requests: 0, cacheHits: 0, lastLatencyMs: null }),
});
const engine: Engine = {
  analyse: async () => ({ bestmove: 'e1d2', score: { cp: 900 }, pv: ['e1d2'] }),
  prefetch: () => undefined,
  ready: async () => undefined,
};

test('table indisponible (pause 429 ou réseau) : Stockfish prend le relais', async () => {
  for (const kind of ['rate-limited', 'network'] as const) {
    const judge = createMoveJudge(deadTable(kind), engine);
    assert.equal(await judge.check(FEN, 'win'), true);
    assert.equal(await judge.reply(FEN, { objective: 'win', previousUci: [] }), 'e1d2');
  }
});

test('erreur qui n’est pas une indisponibilité : pas de repli silencieux', async () => {
  const judge = createMoveJudge(deadTable('bad-request'), engine);
  await assert.rejects(judge.check(FEN, 'win'));
});
