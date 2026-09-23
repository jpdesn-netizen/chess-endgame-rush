// Import des finales de la base de puzzles Lichess (licence CC0).
// Usage : node scripts/import-lichess.mjs <fichier.csv> [parCase=120]
// Sortie : public/data/lichess-endgames.json
//
// Règles de sélection :
//  - thème "endgame" + un thème de finale Lichess (pawnEndgame, rookEndgame…)
//  - 7 pièces maximum dans la position présentée (jugeable par la table Syzygy)
//  - qualité : RatingDeviation ≤ 100, NbPlays ≥ 200, Popularity ≥ 70
//  - échantillon équilibré : jusqu'à N puzzles par (famille × tranche Elo),
//    les plus populaires d'abord (sélection déterministe)
//
// Format Lichess : le FEN est la position AVANT le coup de l'adversaire ;
// le 1er coup de "Moves" est celui de l'adversaire, la solution commence au 2e.

import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';

const input = process.argv[2];
const perCell = Number(process.argv[3] ?? 120);
if (!input) {
  console.error('Usage : node scripts/import-lichess.mjs <fichier.csv> [parCase]');
  process.exit(1);
}

const ENDGAME_THEMES = new Set(['pawnEndgame', 'rookEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame', 'queenRookEndgame']);
const BANDS = [
  { id: '0-999', max: 1000 },
  { id: '1000-1399', max: 1400 },
  { id: '1400-1799', max: 1800 },
  { id: '1800-2199', max: 2200 },
  { id: '2200+', max: Infinity },
];

function familyOf(placement) {
  const pieces = placement.replace(/[^a-zA-Z]/g, '').toLowerCase();
  const others = new Set([...pieces].filter((c) => c !== 'k' && c !== 'p'));
  if (others.size === 0) return pieces.includes('p') ? 'pions' : 'mixte';
  if (others.size > 1) return 'mixte';
  return { q: 'dames', r: 'tours', b: 'fous', n: 'cavaliers' }[[...others][0]];
}

// Découpe CSV simple (les champs Lichess ne contiennent pas de virgule entre guillemets).
const cells = new Map();
let total = 0;
let kept = 0;

const rl = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
let header = true;
for await (const line of rl) {
  if (header) {
    header = false;
    continue;
  }
  total += 1;
  const [id, fen, moves, rating, deviation, popularity, plays, themes, gameUrl] = line.split(',');
  const themeList = themes.split(' ');
  if (!themeList.includes('endgame') || !themeList.some((t) => ENDGAME_THEMES.has(t))) continue;
  if (Number(deviation) > 100 || Number(plays) < 200 || Number(popularity) < 70) continue;

  const uci = moves.split(' ');
  const chess = new Chess(fen);
  let first;
  try {
    first = chess.move({ from: uci[0].slice(0, 2), to: uci[0].slice(2, 4), promotion: uci[0][4] });
  } catch {
    continue;
  }
  const presented = chess.fen();
  const placement = presented.split(' ')[0];
  if (placement.replace(/[^a-zA-Z]/g, '').length > 7) continue;

  const family = familyOf(placement);
  const r = Number(rating);
  const band = BANDS.find((b) => r < b.max).id;
  const key = `${family}|${band}`;
  const list = cells.get(key) ?? [];
  list.push({
    id: `lichess-${id}`,
    fen: presented,
    lastMove: `${first.from}${first.to}`,
    solution: uci.slice(1),
    rating: r,
    popularity: Number(popularity),
    objective: themeList.includes('equality') ? 'draw' : 'win',
    family,
    themes: themeList.filter((t) => !['endgame', 'short', 'long', 'veryLong', 'oneMove'].includes(t)),
    gameUrl,
  });
  cells.set(key, list);
  kept += 1;
}

const selected = [];
for (const [key, list] of [...cells.entries()].sort()) {
  list.sort((a, b) => b.popularity - a.popularity || a.id.localeCompare(b.id));
  const chosen = list.slice(0, perCell).map(({ popularity: _p, ...rest }) => rest);
  selected.push(...chosen);
  console.log(`${key.padEnd(24)} ${String(list.length).padStart(6)} éligibles → ${chosen.length}`);
}
selected.sort((a, b) => a.rating - b.rating);

mkdirSync('public/data', { recursive: true });
writeFileSync(
  'public/data/lichess-endgames.json',
  JSON.stringify({ source: 'Lichess puzzle database (CC0) — https://database.lichess.org/#puzzles', generated: new Date().toISOString().slice(0, 10), puzzles: selected }),
);
console.log(`\n${total} lignes lues, ${kept} finales éligibles, ${selected.length} retenues → public/data/lichess-endgames.json`);
