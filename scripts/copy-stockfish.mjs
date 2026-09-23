// Copie le moteur Stockfish (version « lite single-thread », ≈ 1,8 Mo, sans
// en-têtes CORS particuliers) dans public/stockfish/, sous des noms stables.
// Le script du moteur retrouve son .wasm en remplaçant « .js » par « .wasm »
// dans sa propre URL : les deux fichiers doivent garder le même nom de base.
// Lancé automatiquement par npm install / npm run dev / npm run build.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

const SRC = 'node_modules/stockfish/bin';
const FLAVOR = 'stockfish-19-lite-single';
const DEST = 'public/stockfish';

if (!existsSync(`${SRC}/${FLAVOR}.js`)) {
  console.warn(`[copy-stockfish] ${SRC}/${FLAVOR}.js introuvable : lancez « npm install stockfish ».`);
  process.exit(0);
}
mkdirSync(DEST, { recursive: true });
copyFileSync(`${SRC}/${FLAVOR}.js`, `${DEST}/stockfish.js`);
copyFileSync(`${SRC}/${FLAVOR}.wasm`, `${DEST}/stockfish.wasm`);
console.log(`[copy-stockfish] ${FLAVOR} copié dans ${DEST}/`);
