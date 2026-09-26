// Import des finales de la base de puzzles Lichess (licence CC0), v2.
// Usage : npx tsx scripts/import-lichess.ts lichess_db_puzzle.csv/lichess_db_puzzle.csv
// Sortie : public/data/lichess-endgames.json (format compact, voir src/data/puzzleFormat.ts)
//
// Objectif : au moins MIN_PER_SUB exercices par sous-thème proposé dans
// l'appli, répartis sur les tranches d'Elo, avec l'Elo le plus fiable possible.
//
//  - Classement par les MÊMES fonctions que l'appli (src/core/categories.ts),
//    donc les compteurs affichés correspondent exactement.
//  - Positions retenues : ≤ MAX_PIECES pièces après le 1er coup, et thème
//    Lichess « endgame » ou ≤ 7 pièces (une position de ≤ 7 pièces est une
//    finale même si Lichess ne l'a pas étiquetée ainsi : tour contre fou…).
//  - Qualité, par paliers : on prend d'abord les puzzles à l'Elo le plus sûr,
//    et on ne descend au palier suivant que si le sous-thème manque d'exercices :
//      palier 1 : écart-type Elo (RatingDeviation) ≤ 100, ≥ 200 parties, popularité ≥ 70
//      palier 2 : ≤ 150, ≥ 50 parties, popularité ≥ 50
//      palier 3 : ≤ 200, ≥ 20 parties, popularité ≥ 0
//  - Par sous-thème exact : 40 par tranche d'Elo (200 au plus) ; s'il en
//    manque, on complète avec les autres tranches jusqu'à TARGET.
//    Catégories « -autres » : 300 par tranche.
//
// Format Lichess : le FEN est la position AVANT le coup de l'adversaire ;
// le 1er coup de "Moves" est celui de l'adversaire, la solution commence au 2e.

import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';
import { SUBCATEGORIES, subcategoryOf } from '../src/core/categories';
import { familyOf } from '../src/core/material';
import type { Family } from '../src/core/types';
import { encodePuzzles } from '../src/data/puzzleFormat';

const input = process.argv[2];
if (!input) {
  console.error('Usage : npx tsx scripts/import-lichess.ts <lichess_db_puzzle.csv>');
  process.exit(1);
}

const MAX_PIECES = 12;
export const MIN_PER_SUB = 100;
const TARGET = 150; // marge au-dessus du minimum (des puzzles peuvent être écartés à l'usage)
const PER_BAND = 40;
const PER_BAND_OTHERS = 300;
const BANDS = [1000, 1400, 1800, 2200, Infinity];
const KEEP = 3; // on garde en mémoire jusqu'à KEEP × quota par case (les plus populaires)

function tierOf(rd: number, plays: number, pop: number): 1 | 2 | 3 | 0 {
  if (rd <= 100 && plays >= 200 && pop >= 70) return 1;
  if (rd <= 150 && plays >= 50 && pop >= 50) return 2;
  if (rd <= 200 && plays >= 20) return 3;
  return 0;
}

interface Item {
  id: string;
  fen: string;
  lastMove: string;
  solution: string[];
  rating: number;
  popularity: number;
  tier: number;
  objective: 'win' | 'draw';
  family: Family;
  pieces: number;
  themes: string[];
  gameUrl: string;
}

const cells = new Map<string, Item[]>(); // clé : sous-thème|tranche
const quota = (sub: string) => (sub.endsWith('-autres') ? PER_BAND_OTHERS : PER_BAND);
const better = (a: Item, b: Item) => a.tier - b.tier || b.popularity - a.popularity || a.id.localeCompare(b.id);

let total = 0;
let eligible = 0;
const rl = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
let header = true;
for await (const line of rl) {
  if (header) {
    header = false;
    continue;
  }
  total += 1;
  if (total % 1_000_000 === 0) console.log(`${total / 1_000_000} M lignes…`);
  const [id, fen, moves, rating, deviation, popularity, plays, themes, gameUrl] = line.split(',');
  // Filtre rapide sur le nombre de pièces avant tout calcul.
  const placement0 = fen.split(' ')[0];
  const count0 = placement0.replace(/[^a-zA-Z]/g, '').length;
  if (count0 > MAX_PIECES + 1) continue;
  const tier = tierOf(Number(deviation), Number(plays), Number(popularity));
  if (!tier) continue;
  const themeList = themes.split(' ');

  const uci = moves.split(' ');
  const chess = new Chess(fen);
  let first;
  try {
    first = chess.move({ from: uci[0].slice(0, 2), to: uci[0].slice(2, 4), promotion: uci[0][4] });
  } catch {
    continue;
  }
  const presented = chess.fen();
  const pieces = presented.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
  if (pieces > MAX_PIECES) continue;
  if (!themeList.includes('endgame') && pieces > 7) continue;

  const family = familyOf(presented);
  const sub = subcategoryOf(presented, family);
  const r = Number(rating);
  const key = `${sub}|${BANDS.findIndex((b) => r < b)}`;
  const list = cells.get(key) ?? [];
  list.push({
    id: `lichess-${id}`,
    fen: presented,
    lastMove: `${first.from}${first.to}`,
    solution: uci.slice(1),
    rating: r,
    popularity: Number(popularity),
    tier,
    objective: themeList.includes('equality') ? 'draw' : 'win',
    family,
    pieces,
    themes: themeList.filter((t) => !['endgame', 'short', 'long', 'veryLong', 'oneMove'].includes(t)),
    gameUrl,
  });
  if (list.length > 2 * KEEP * quota(sub)) list.sort(better).splice(KEEP * quota(sub));
  cells.set(key, list);
  eligible += 1;
}

// Sélection par sous-thème
const subs = new Set([...cells.keys()].map((k) => k.split('|')[0]));
for (const s of SUBCATEGORIES) subs.add(s.id);
const selected: Item[] = [];
const report: string[] = [];
for (const sub of [...subs].sort()) {
  const perBand = BANDS.map((_, i) => (cells.get(`${sub}|${i}`) ?? []).sort(better));
  const chosen = perBand.flatMap((l) => l.slice(0, quota(sub)));
  if (chosen.length < TARGET) {
    // Complément : les meilleurs restants, toutes tranches confondues.
    const rest = perBand.flatMap((l) => l.slice(quota(sub))).sort(better);
    chosen.push(...rest.slice(0, TARGET - chosen.length));
  }
  selected.push(...chosen);
  const tiers = [1, 2, 3].map((t) => chosen.filter((c) => c.tier === t).length);
  const bands = BANDS.map((b, i) => chosen.filter((c) => c.rating < b && (i === 0 || c.rating >= BANDS[i - 1])).length);
  report.push(
    `${sub.padEnd(18)} ${String(chosen.length).padStart(5)}  ${chosen.length >= MIN_PER_SUB ? 'OK ' : 'MANQUE'}  paliers ${tiers.join('/')}  tranches ${bands.join('/')}`,
  );
}
console.log(report.join('\n'));

selected.sort((a, b) => a.rating - b.rating);
mkdirSync('public/data', { recursive: true });
writeFileSync(
  'public/data/lichess-endgames.json',
  JSON.stringify(
    encodePuzzles(
      selected.map(({ popularity: _p, tier: _t, ...rest }) => rest),
      {
        source: 'Lichess puzzle database (CC0) — https://database.lichess.org/#puzzles',
        generated: new Date().toISOString().slice(0, 10),
        minPerSubcategory: MIN_PER_SUB,
      },
    ),
  ),
);
console.log(`\n${total} lignes lues, ${eligible} finales éligibles, ${selected.length} retenues → public/data/lichess-endgames.json`);
