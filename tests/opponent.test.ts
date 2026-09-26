import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseDefense, pickNearBest, strongestDefenses } from '../src/core/judge/opponent';
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

test('entraînement : défenses à 1 coup près de la meilleure, jamais un cadeau', () => {
  // Joueur gagnant : Kf5 résiste 25 demi-coups ; Kd5 (23) à 1 coup près ; Ke6 (11) cède bien trop vite.
  const pos = tbPosition('loss', [
    tbMove('e5e6', 'Ke6', 'win', 11),
    tbMove('e5f5', 'Kf5', 'win', 25),
    tbMove('e5d5', 'Kd5', 'win', 23),
  ]);
  assert.deepEqual(strongestDefenses(pos).map((m) => m.san).sort(), ['Kd5', 'Kf5']);
  // Une nulle disponible passe avant tout le reste.
  const withDraw = tbPosition('draw', [...pos.moves, tbMove('e5d4', 'Kd4', 'draw', 0)]);
  assert.deepEqual(strongestDefenses(withDraw).map((m) => m.san), ['Kd4']);
  // Nulle : tous les coups qui la gardent, jamais un coup qui offre le gain.
  const draw = tbPosition('draw', [tbMove('a6a1', 'Ra1', 'win', 30), tbMove('a6a7', 'Ra7', 'draw', 0), tbMove('a6a8', 'Ra8', 'draw', 0)]);
  assert.deepEqual(strongestDefenses(draw).map((m) => m.san).sort(), ['Ra7', 'Ra8']);
});

test('entraînement : tirage parmi les coups presque aussi bons selon Stockfish', () => {
  const lines = [
    { move: 'a6a7', score: { cp: 40 } },
    { move: 'a6a8', score: { cp: 25 } }, // 15 cp de moins : gardé
    { move: 'a6b6', score: { cp: -60 } }, // 100 cp de moins : écarté
  ];
  const picks = new Set([0, 0.49, 0.99].map((r) => pickNearBest(lines, () => r)));
  assert.deepEqual([...picks].sort(), ['a6a7', 'a6a8']);
  assert.equal(pickNearBest([]), null);
});
