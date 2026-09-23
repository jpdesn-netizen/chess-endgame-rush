// Vérifie chaque puzzle de la collection auprès de la table de finales Lichess :
// le résultat théorique doit correspondre à l'objectif annoncé.
// Usage : npm run verify:puzzles   (nécessite Internet)

import { outcomeOf } from '../src/core/judge/outcome';
import { correctMoves } from '../src/core/judge/tablebaseJudge';
import { PUZZLES_MOCK } from '../src/data/puzzlesMock';
import { createTablebaseClient } from '../src/services/tablebaseClient';

const client = createTablebaseClient();
let failures = 0;

for (const p of PUZZLES_MOCK) {
  try {
    const tb = await client.lookup(p.fen);
    const outcome = outcomeOf(tb.category);
    const expected = p.objective === 'win' ? 'win' : 'draw';
    const good = correctMoves(tb);
    const ok = outcome === expected;
    if (!ok) failures += 1;
    console.log(
      `${ok ? '✅' : '❌'} ${p.id.padEnd(28)} attendu=${expected.padEnd(4)} table=${tb.category.padEnd(12)} ` +
        `coups justes ${good.length}/${tb.moves.length} : ${good.slice(0, 5).map((m) => m.san).join(' ')}`,
    );
  } catch (error) {
    failures += 1;
    console.log(`❌ ${p.id} : ${error instanceof Error ? error.message : String(error)}`);
  }
  await new Promise((r) => setTimeout(r, 300)); // rester poli avec l'API
}

console.log(failures === 0 ? '\nToutes les positions sont conformes.' : `\n${failures} position(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
