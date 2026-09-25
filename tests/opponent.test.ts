import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseDefense, chooseVariedDefense } from '../src/core/judge/opponent';
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

test('entraînement : défense variée parmi les coups de même valeur, jamais une mauvaise défense', () => {
  // Joueur gagnant : Kf5 (mat en 25 demi-coups) = meilleure résistance ; Kd5 (23) proche ; Ke6 (11) trop rapide.
  const pos = tbPosition('loss', [
    tbMove('e5e6', 'Ke6', 'win', 11),
    tbMove('e5f5', 'Kf5', 'win', 25),
    tbMove('e5d5', 'Kd5', 'win', 23),
    tbMove('e5d4', 'Kd4', 'draw', 0), // n'existe pas en vrai, mais ne doit jamais être choisi s'il change le résultat… sauf s'il est meilleur
  ]);
  // La nulle est meilleure pour l'adversaire : elle est toujours choisie.
  assert.equal(chooseVariedDefense(pos, () => 0.99)?.san, 'Kd4');
  const noDraw = tbPosition('loss', pos.moves.slice(0, 3));
  const picks = new Set([0, 0.5, 0.99].map((r) => chooseVariedDefense(noDraw, () => r)?.san));
  assert.deepEqual([...picks].sort(), ['Kd5', 'Kf5']); // variété, mais jamais Ke6
  // Nulle : n'importe quel coup qui la garde
  const draw = tbPosition('draw', [tbMove('a6a1', 'Ra1', 'win', 30), tbMove('a6a7', 'Ra7', 'draw', 0), tbMove('a6a8', 'Ra8', 'draw', 0)]);
  const drawPicks = new Set([0, 0.99].map((r) => chooseVariedDefense(draw, () => r)?.san));
  assert.deepEqual([...drawPicks].sort(), ['Ra7', 'Ra8']);
});
