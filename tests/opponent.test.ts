import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseDefense } from '../src/core/judge/opponent';
import { tbMove, tbPosition } from './fixtures';

test("l'adversaire perdant choisit le mat le plus lointain", () => {
  // Catégories du point de vue du joueur : "win" = le joueur gagne toujours.
  const pos = tbPosition('loss', [
    tbMove('e5e6', 'Ke6', 'win', 11),
    tbMove('e5f5', 'Kf5', 'win', 25),
    tbMove('e5d5', 'Kd5', 'win', 17),
  ]);
  assert.equal(chooseDefense(pos)?.san, 'Kf5');
});

test("l'adversaire préfère une nulle à une défaite", () => {
  const pos = tbPosition('draw', [tbMove('a6a1', 'Ra1', 'win', 30), tbMove('a6a7', 'Ra7', 'draw', 0)]);
  assert.equal(chooseDefense(pos)?.san, 'Ra7');
});

test("l'adversaire gagnant choisit le gain le plus rapide", () => {
  const pos = tbPosition('win', [tbMove('a2a1q', 'a1=Q', 'loss', -9), tbMove('b3b2', 'Kb2', 'loss', -21)]);
  assert.equal(chooseDefense(pos)?.san, 'a1=Q');
});

test('aucun coup : null', () => {
  assert.equal(chooseDefense(tbPosition('draw', [])), null);
});
