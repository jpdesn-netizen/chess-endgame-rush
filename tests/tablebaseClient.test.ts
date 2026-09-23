import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTablebaseClient, TablebaseError } from '../src/services/tablebaseClient';
import { tbPosition } from './fixtures';

const FEN = '8/8/8/4k3/8/8/8/3QK3 w - - 0 1';
const okResponse = () => new Response(JSON.stringify(tbPosition('win', [], 13)), { status: 200 });

test('cache : deux demandes = un seul appel réseau', async () => {
  let calls = 0;
  const client = createTablebaseClient({
    fetchImpl: async () => {
      calls += 1;
      return okResponse();
    },
  });
  const [a, b] = await Promise.all([client.lookup(FEN), client.lookup(FEN)]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(client.stats().cacheHits, 1);
});

test("l'URL encode le FEN", async () => {
  let url = '';
  const client = createTablebaseClient({
    fetchImpl: async (input) => {
      url = String(input);
      return okResponse();
    },
  });
  await client.lookup(FEN);
  assert.ok(url.startsWith('https://tablebase.lichess.ovh/standard?fen=8%2F8%2F8%2F4k3'));
});

test('plus de 7 pièces : refus sans appel réseau', async () => {
  let calls = 0;
  const client = createTablebaseClient({ fetchImpl: async () => (calls++, okResponse()) });
  await assert.rejects(client.lookup('4k3/pppp4/8/8/8/8/PPPP4/4K3 w - - 0 1'), (e: unknown) => {
    return e instanceof TablebaseError && e.kind === 'too-many-pieces';
  });
  assert.equal(calls, 0);
});

test('erreur réseau : nouvelles tentatives puis succès', async () => {
  let calls = 0;
  const client = createTablebaseClient({
    retryDelayMs: 1,
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) throw new TypeError('failed to fetch');
      return okResponse();
    },
  });
  const pos = await client.lookup(FEN);
  assert.equal(pos.category, 'win');
  assert.equal(calls, 3);
});

test('429 : erreur "rate-limited" sans nouvelle tentative, puis retrait du cache', async () => {
  let calls = 0;
  const client = createTablebaseClient({
    retryDelayMs: 1,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? new Response('', { status: 429 }) : okResponse();
    },
  });
  await assert.rejects(client.lookup(FEN), (e: unknown) => e instanceof TablebaseError && e.kind === 'rate-limited');
  assert.equal(calls, 1);
  // Nouvel essai possible (l'échec n'est pas resté en cache).
  await new Promise((r) => setTimeout(r, 0));
  const pos = await client.lookup(FEN);
  assert.equal(pos.category, 'win');
});
