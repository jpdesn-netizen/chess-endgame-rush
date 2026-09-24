// Génère des exercices pour les sous-thèmes que la base de puzzles Lichess ne
// fournit pas en nombre suffisant, à l'aide de la table de finales Lichess.
//
// À lancer sur un PC connecté à Internet (dossier du projet) :
//   npx tsx scripts/generate-tablebase.ts
// Options : --subs kp-k,k2p-k,bp-b,b2p-b   --target 150   --delay 1100 (ms entre requêtes)
//
//  - Respect de l'API Lichess : une requête à la fois, ~1 par seconde ; en cas de
//    réponse 429 (trop de requêtes), pause d'une minute puis reprise.
//  - Reprise possible : la progression est enregistrée après chaque exercice
//    (scripts/.work/tablebase-progress.json). Relancer la même commande continue.
//  - Sortie : public/data/tablebase-endgames.json (chargé par l'appli, Elo marqué « estimé »).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CONFIG } from '../src/core/config';
import type { TbPosition } from '../src/core/judge/tablebaseTypes';
import { familyOf } from '../src/core/material';
import type { Objective } from '../src/core/types';
import { buildLine, estimateRating, goodMoves, isNaturalMove, isPuzzleStart, MATERIAL, randomPosition } from './lib/tbGenerator';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const SUBS = arg('subs', Object.keys(MATERIAL).join(',')).split(',').filter((s) => MATERIAL[s]);
const TARGET = Number(arg('target', '150'));
const DELAY = Math.max(1000, Number(arg('delay', '1100')));
const MAX_REQUESTS_PER_SUB = Number(arg('max-requests', '6000'));
const DRAW_SHARE = 0.3; // part d'exercices de défense (tenir la nulle)

const WORK = 'scripts/.work/tablebase-progress.json';
const OUT = 'public/data/tablebase-endgames.json';

interface Generated {
  id: string;
  fen: string;
  lastMove: string;
  solution: string[];
  rating: number;
  ratingEstimated: true;
  objective: Objective;
  family: string;
  subcategory: string;
  pieces: number;
  themes: string[];
  gameUrl: string;
}

const progress: { puzzles: Generated[]; requests: Record<string, number> } = existsSync(WORK)
  ? JSON.parse(readFileSync(WORK, 'utf8'))
  : { puzzles: [], requests: {} };
const save = () => {
  mkdirSync('scripts/.work', { recursive: true });
  writeFileSync(WORK, JSON.stringify(progress));
  writeFileSync(
    OUT,
    JSON.stringify({
      source: 'Positions générées, solutions vérifiées par la table de finales Lichess (Syzygy) — Elo estimé',
      generated: new Date().toISOString().slice(0, 10),
      puzzles: progress.puzzles,
    }),
  );
};

// ------------------------------------------------ Table de finales (réseau)
const cache = new Map<string, TbPosition>();
let last = 0;
let currentSub = '';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lookup(fen: string): Promise<TbPosition> {
  const hit = cache.get(fen);
  if (hit) return hit;
  for (;;) {
    const wait = last + DELAY - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    progress.requests[currentSub] = (progress.requests[currentSub] ?? 0) + 1;
    let res: Response;
    try {
      res = await fetch(`${CONFIG.tablebase.url}?fen=${encodeURIComponent(fen)}`, {
        headers: { 'User-Agent': 'chess-endgame-rush exercise generator (open source, 1 req/s)' },
      });
    } catch (e) {
      console.warn('  réseau indisponible, nouvel essai dans 30 s…', (e as Error).message);
      await sleep(30_000);
      continue;
    }
    if (res.status === 429) {
      console.warn('  limite Lichess atteinte (429) : pause d’une minute…');
      await sleep(60_000);
      continue;
    }
    if (!res.ok) throw new Error(`Table de finales : HTTP ${res.status}`);
    const pos = (await res.json()) as TbPosition;
    cache.set(fen, pos);
    return pos;
  }
}

// ---------------------------------------------------------------- Boucle
const known = new Set(progress.puzzles.map((p) => p.fen.split(' ').slice(0, 2).join(' ')));
const count = (sub: string) => progress.puzzles.filter((p) => p.subcategory === sub).length;

for (const sub of SUBS) {
  currentSub = sub;
  console.log(`\n=== ${sub} : ${count(sub)}/${TARGET} déjà générés`);
  while (count(sub) < TARGET && (progress.requests[sub] ?? 0) < MAX_REQUESTS_PER_SUB) {
    const objective: Objective = Math.random() < DRAW_SHARE ? 'draw' : 'win';
    const fen = randomPosition(sub, objective, Math.random);
    if (!fen || known.has(fen.split(' ').slice(0, 2).join(' '))) continue;
    const start = await lookup(fen);
    if (!isPuzzleStart(start, objective)) continue;
    const line = await buildLine(fen, objective, lookup);
    if (!line) continue;
    const first = goodMoves(start, objective)[0];
    const rating = estimateRating({
      sub,
      objective,
      playerMoves: line.playerMoves,
      dtz: start.dtz,
      legalMoves: start.moves.length,
      naturalMove: isNaturalMove(fen, first),
    });
    const n = count(sub) + 1;
    progress.puzzles.push({
      id: `tb-${sub}-${n}-${Date.now().toString(36)}`,
      fen,
      lastMove: '',
      solution: line.solution,
      rating,
      ratingEstimated: true,
      objective,
      family: familyOf(fen),
      subcategory: sub,
      pieces: fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length,
      themes: objective === 'draw' ? ['defensiveMove'] : [],
      gameUrl: '',
    });
    known.add(fen.split(' ').slice(0, 2).join(' '));
    save();
    console.log(`  ${sub} ${n}/${TARGET}  ${objective === 'win' ? 'gain ' : 'nulle'}  Elo≈${rating}  ${line.playerMoves} coup(s)  [${progress.requests[sub]} requêtes]`);
  }
}
save();

console.log('\nBilan :');
for (const sub of SUBS) {
  const list = progress.puzzles.filter((p) => p.subcategory === sub);
  const bands = [1000, 1400, 1800, 2200, Infinity].map((b, i, a) => list.filter((p) => p.rating < b && (i === 0 || p.rating >= a[i - 1])).length);
  console.log(`  ${sub.padEnd(7)} ${String(list.length).padStart(4)} exercices · tranches Elo ${bands.join('/')} · ${progress.requests[sub] ?? 0} requêtes`);
}
console.log(`\n→ ${OUT} (relancez « npm run build » pour l'inclure dans le site)`);
