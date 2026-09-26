// Arbitre des coups : table de finales jusqu'à 7 pièces, Stockfish au-delà.
// La position est routée automatiquement : une finale longue qui se
// simplifie en cours de puzzle passe d'elle-même à la table de finales.

import { applyUci, type AppliedMove } from '../core/chessRules';
import { CONFIG } from '../core/config';
import { countPieces } from '../core/fen';
import { judgeByEngine, toCp } from '../core/judge/engineJudge';
import { applyLineTolerance, isOnLine, preferLineReply } from '../core/judge/lineRules';
import { outcomeOf } from '../core/judge/outcome';
import { chooseDefense, strongestDefenses } from '../core/judge/opponent';
import { judgeMove, type Verdict } from '../core/judge/tablebaseJudge';
import type { Objective } from '../core/types';
import type { Engine } from './stockfish';
import { TablebaseError, type TablebaseClient } from './tablebaseClient';

export interface JudgeContext {
  objective: Objective;
  /** Coups déjà joués dans le puzzle (UCI), avant le coup jugé. */
  previousUci: string[];
  /** Ligne de la partie réelle (UCI), si connue. */
  solution?: string[];
  /**
   * Entraînement : défense la plus forte selon la table, départagée par Stockfish
   * entre coups équivalents (sans rejouer la partie réelle).
   */
  vary?: boolean;
}

export type JudgeSource = 'tablebase' | 'engine';

export interface MoveJudge {
  source(fen: string): JudgeSource;
  judge(move: AppliedMove, ctx: JudgeContext): Promise<Verdict>;
  /** Réponse adverse (UCI) dans la position `fen` (adversaire au trait). */
  reply(fen: string, ctx: JudgeContext): Promise<string | null>;
  /** Précharge ce qui sera nécessaire pour juger le prochain coup. */
  prefetch(fen: string, ctx: JudgeContext): void;
  /** Vérifie que l'objectif annoncé correspond bien à la position. */
  check(fen: string, objective: Objective): Promise<boolean>;
}

const lineMove = (ctx: JudgeContext) =>
  ctx.solution && isOnLine(ctx.previousUci, ctx.solution) ? ctx.solution[ctx.previousUci.length] ?? null : null;

export function createMoveJudge(tablebase: TablebaseClient, engine: Engine): MoveJudge {
  const movetime = CONFIG.engine.movetimeMs;
  const source = (fen: string): JudgeSource => (countPieces(fen) <= CONFIG.tablebase.maxPieces ? 'tablebase' : 'engine');

  async function judgeWithTablebase(move: AppliedMove, ctx: JudgeContext): Promise<Verdict> {
    const before = await tablebase.lookup(move.fenBefore);
    const raw = judgeMove(before, move.uci, { slowMoveToleranceMoves: CONFIG.judge.slowMoveToleranceMoves });
    if (!raw) throw new Error(`Coup ${move.san} absent de la réponse de la table.`);
    return applyLineTolerance(raw, move.uci, ctx.previousUci, ctx.solution);
  }

  async function judgeWithEngine(move: AppliedMove, ctx: JudgeContext): Promise<Verdict> {
    // Le coup de la partie réelle est accepté d'emblée (réponse instantanée).
    if (lineMove(ctx) === move.uci) return { kind: 'good', san: move.san, outcome: 'win', isBest: true, verified: true };
    const [best, after] = await Promise.all([engine.analyse(move.fenBefore, movetime), engine.analyse(move.fen, movetime)]);
    const bestApplied = best.bestmove ? applyUci(move.fenBefore, best.bestmove) : null;
    return judgeByEngine({
      objective: ctx.objective,
      san: move.san,
      best: best.score,
      bestSan: bestApplied?.san ?? null,
      bestUci: best.bestmove,
      after: after.score,
      isCheckmate: move.isCheckmate,
      options: CONFIG.engine,
    });
  }

  /**
   * Repli : si la table de finales ne répond pas (réseau, pause après 429,
   * erreur serveur), Stockfish prend le relais pour que la partie continue.
   */
  const unavailable = (e: unknown) =>
    e instanceof TablebaseError && (e.kind === 'network' || e.kind === 'rate-limited' || e.kind === 'server');
  const withFallback = async <T,>(viaTable: () => Promise<T>, viaEngine: () => Promise<T>): Promise<T> => {
    try {
      return await viaTable();
    } catch (e) {
      if (!unavailable(e)) throw e;
      console.warn('[table de finales] indisponible, repli sur Stockfish :', (e as Error).message);
      return viaEngine();
    }
  };

  /**
   * Parmi des coups que la table juge équivalents, celui que Stockfish préfère
   * (le plus coriace en pratique) ; null si Stockfish ne répond pas en 2,5 s
   * ou préfère un autre coup.
   */
  async function engineChoice(fen: string, candidates: string[]): Promise<string | null> {
    try {
      const bestmove = await Promise.race([
        engine.analyse(fen, movetime).then((a) => a.bestmove),
        new Promise<null>((r) => setTimeout(() => r(null), 2_500)),
      ]);
      return bestmove && candidates.includes(bestmove) ? bestmove : null;
    } catch {
      return null;
    }
  }

  /** Meilleure réponse adverse (SAN) après un mauvais coup ; rien si indisponible en 1,5 s. */
  async function refute(fen: string): Promise<string | undefined> {
    const find = async () => {
      if (source(fen) === 'tablebase') {
        const best = chooseDefense(await tablebase.lookup(fen));
        if (best) return best.san;
      }
      const bestmove = (await engine.analyse(fen, movetime)).bestmove;
      return bestmove ? applyUci(fen, bestmove)?.san : undefined;
    };
    try {
      return await Promise.race([find(), new Promise<undefined>((r) => setTimeout(() => r(undefined), 1_500))]);
    } catch {
      return undefined;
    }
  }

  return {
    source,

    async judge(move, ctx) {
      const verdict =
        source(move.fenBefore) === 'tablebase'
          ? await withFallback(
              () => judgeWithTablebase(move, ctx),
              () => judgeWithEngine(move, ctx),
            )
          : await judgeWithEngine(move, ctx);
      // Coup perdant ou qui gâche le gain : montrer la réponse adverse qui le punit.
      if (verdict.kind === 'bad' && verdict.reason !== 'too-slow') {
        const refutation = await refute(move.fen);
        if (refutation) return { ...verdict, refutation };
      }
      return verdict;
    },

    async reply(fen, ctx) {
      const expected = lineMove(ctx);
      if (source(fen) === 'tablebase') {
        return withFallback(
          async () => {
            const position = await tablebase.lookup(fen);
            if (ctx.vary) {
              const ties = strongestDefenses(position);
              if (ties.length <= 1) return ties[0]?.uci ?? null;
              const choice = await engineChoice(fen, ties.map((m) => m.uci));
              return choice ?? ties[Math.floor(Math.random() * ties.length)].uci;
            }
            const best = chooseDefense(position);
            if (!best) return null;
            return preferLineReply(position, best, ctx.previousUci, ctx.solution).uci;
          },
          async () => (!ctx.vary && expected && applyUci(fen, expected) ? expected : (await engine.analyse(fen, movetime)).bestmove),
        );
      }
      // Plus de 7 pièces : on rejoue la partie réelle tant qu'on la suit,
      // sinon le meilleur coup de Stockfish.
      if (expected && applyUci(fen, expected)) return expected;
      const analysis = await engine.analyse(fen, movetime);
      return analysis.bestmove;
    },

    async check(fen, objective) {
      const viaEngine = async () => {
        const cp = toCp((await engine.analyse(fen, movetime)).score);
        return objective === 'win'
          ? cp >= CONFIG.engine.winThresholdCp
          : cp > -CONFIG.engine.winThresholdCp && cp < CONFIG.engine.winThresholdCp;
      };
      if (source(fen) === 'tablebase') {
        return withFallback(async () => {
          const outcome = outcomeOf((await tablebase.lookup(fen)).category);
          return outcome === (objective === 'win' ? 'win' : 'draw');
        }, viaEngine);
      }
      return viaEngine();
    },

    prefetch(fen, ctx) {
      const expected = lineMove(ctx);
      if (source(fen) === 'tablebase') {
        tablebase.prefetch(fen);
        const after = expected ? applyUci(fen, expected) : null;
        if (after && source(after.fen) === 'tablebase') tablebase.prefetch(after.fen);
        else if (after) engine.prefetch(after.fen, movetime);
      } else {
        // Évaluation de la position : sert de référence pour juger un écart.
        engine.prefetch(fen, movetime);
      }
    },
  };
}
