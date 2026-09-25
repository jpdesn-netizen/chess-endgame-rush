// Arbitre des coups : table de finales jusqu'à 7 pièces, Stockfish au-delà.
// La position est routée automatiquement : une finale longue qui se
// simplifie en cours de puzzle passe d'elle-même à la table de finales.

import { applyUci, type AppliedMove } from '../core/chessRules';
import { CONFIG } from '../core/config';
import { countPieces } from '../core/fen';
import { judgeByEngine, toCp } from '../core/judge/engineJudge';
import { applyLineTolerance, isOnLine, preferLineReply } from '../core/judge/lineRules';
import { outcomeOf } from '../core/judge/outcome';
import { chooseDefense } from '../core/judge/opponent';
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

  return {
    source,

    judge(move, ctx) {
      return source(move.fenBefore) === 'tablebase'
        ? withFallback(
            () => judgeWithTablebase(move, ctx),
            () => judgeWithEngine(move, ctx),
          )
        : judgeWithEngine(move, ctx);
    },

    async reply(fen, ctx) {
      const expected = lineMove(ctx);
      if (source(fen) === 'tablebase') {
        return withFallback(
          async () => {
            const position = await tablebase.lookup(fen);
            const best = chooseDefense(position);
            if (!best) return null;
            return preferLineReply(position, best, ctx.previousUci, ctx.solution).uci;
          },
          async () => (expected && applyUci(fen, expected) ? expected : (await engine.analyse(fen, movetime)).bestmove),
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
