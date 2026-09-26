import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseDefense, strongestDefenses } from '../src/core/judge/opponent';
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

test('entraînement : seules les défenses exactement aussi fortes que la meilleure', () => {
  // Joueur gagnant : Kf5 et Kg4 résistent 25 demi-coups ; Kd5 (23) et Ke6 (11) cèdent plus vite.
  const pos = tbPosition('loss', [
    tbMove('e5e6', 'Ke6', 'win', 11),
    tbMove('e5f5', 'Kf5', 'win', 25),
    tbMove('e5d5', 'Kd5', 'win', 23),
    tbMove('e5f4', 'Kg4', 'win', 25),
  ]);
  assert.deepEqual(strongestDefenses(pos).map((m) => m.san).sort(), ['Kf5', 'Kg4']);
  // Une nulle disponible passe avant tout le reste.
  const withDraw = tbPosition('draw', [...pos.moves, tbMove('e5d4', 'Kd4', 'draw', 0)]);
  assert.deepEqual(strongestDefenses(withDraw).map((m) => m.san), ['Kd4']);
  // Nulle : tous les coups qui la gardent (Stockfish départage ensuite), jamais un coup perdant.
  const draw = tbPosition('draw', [tbMove('a6a1', 'Ra1', 'win', 30), tbMove('a6a7', 'Ra7', 'draw', 0), tbMove('a6a8', 'Ra8', 'draw', 0)]);
  assert.deepEqual(strongestDefenses(draw).map((m) => m.san).sort(), ['Ra7', 'Ra8']);
});
