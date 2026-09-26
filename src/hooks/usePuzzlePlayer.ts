// Relie le reducer pur (puzzleSession) au monde extérieur : arbitre
// (table de finales ou Stockfish), délai de la réponse adverse, préchargement.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { applyMove, applyUci } from '../core/chessRules';
import { CONFIG, type ModeRules } from '../core/config';
import { initialSession, sessionReducer } from '../core/session/puzzleSession';
import type { PromotionPiece, Puzzle } from '../core/types';
import type { JudgeSource, MoveJudge } from '../services/moveJudge';
import { playSound } from '../services/sound';

export interface Timings {
  /** Temps entre le coup du joueur et le verdict. */
  verdictMs: number | null;
  /** Temps de calcul de la réponse adverse (hors délai d'affichage). */
  opponentMs: number | null;
  source: JudgeSource | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function usePuzzlePlayer(puzzle: Puzzle, rules: ModeRules, judge: MoveJudge, onPlayerMove?: () => void) {
  const [state, dispatch] = useReducer(sessionReducer, undefined, () => initialSession(puzzle, rules));
  const [timings, setTimings] = useState<Timings>({ verdictMs: null, opponentMs: null, source: null });
  // Jeton incrémenté à chaque reset / démontage : les réponses arrivées trop
  // tard pour un puzzle abandonné sont ignorées.
  const token = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Un nouveau puzzle = nouveau composant (clé React) : préchargement initial.
  useEffect(() => {
    judge.prefetch(puzzle.fen, { objective: puzzle.objective, previousUci: [], solution: puzzle.solution });
    return () => {
      token.current += 1;
    };
  }, [puzzle, judge]);

  const reset = useCallback(() => {
    token.current += 1;
    setTimings({ verdictMs: null, opponentMs: null, source: null });
    dispatch({ type: 'RESET' });
  }, []);

  /** Reprend le mauvais coup (entraînement) : la position d'avant est déjà en cache. */
  const takeBack = useCallback(() => {
    token.current += 1;
    dispatch({ type: 'TAKEBACK' });
  }, []);

  const playMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece): boolean => {
      const current = stateRef.current;
      if (current.phase !== 'awaitingPlayer' || current.puzzle !== puzzle) return false;
      const applied = applyMove(current.fen, from, to, promotion);
      if (!applied) return false; // coup illégal : la pièce revient, sans pénalité

      const myToken = token.current;
      const started = performance.now();
      const previousUci = current.moves.map((m) => m.uci);
      const ctx = { objective: puzzle.objective, previousUci, solution: puzzle.solution, vary: rules.varyDefense };
      // Le reducer étant pur, on calcule localement les états suivants pour
      // décider de la suite sans attendre le prochain rendu React.
      const afterPlayer = sessionReducer(current, { type: 'PLAYER_MOVED', move: applied });
      dispatch({ type: 'PLAYER_MOVED', move: applied });
      playSound(applied.san.includes('x') ? 'capture' : 'move');
      onPlayerMove?.();

      void (async () => {
        try {
          const verdict = await judge.judge(applied, ctx);
          if (token.current !== myToken) return;
          setTimings((t) => ({ ...t, verdictMs: Math.round(performance.now() - started), source: judge.source(applied.fenBefore) }));
          dispatch({ type: 'VERDICT', verdict });
          const afterVerdict = sessionReducer(afterPlayer, { type: 'VERDICT', verdict });
          if (afterVerdict.phase === 'solved') playSound('success');
          if (afterVerdict.phase === 'failed') playSound('error');
          if (afterVerdict.phase !== 'opponentThinking') return; // puzzle terminé

          const opponentStart = performance.now();
          const replyCtx = { ...ctx, previousUci: [...previousUci, applied.uci] };
          const replyUci = await judge.reply(applied.fen, replyCtx);
          if (token.current !== myToken || !replyUci) return;
          const reply = applyUci(applied.fen, replyUci);
          if (!reply) throw new Error(`Réponse adverse illégale : ${replyUci}`);
          setTimings((t) => ({ ...t, opponentMs: Math.round(performance.now() - opponentStart) }));
          const wait = CONFIG.ui.opponentMinDelayMs - (performance.now() - opponentStart);
          if (wait > 0) await sleep(wait);
          if (token.current !== myToken) return;
          dispatch({ type: 'OPPONENT_MOVED', move: reply });
          playSound(reply.san.includes('x') ? 'capture' : 'move');
          // Préchargement : le verdict du prochain coup sera immédiat.
          judge.prefetch(reply.fen, { ...ctx, previousUci: [...replyCtx.previousUci, reply.uci] });
        } catch (error) {
          if (token.current !== myToken) return;
          dispatch({ type: 'ERROR', message: error instanceof Error ? error.message : String(error) });
        }
      })();
      return true;
    },
    [judge, puzzle, onPlayerMove],
  );

  return { state, timings, playMove, reset, takeBack };
}
