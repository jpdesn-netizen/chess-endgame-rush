// Relie le reducer pur (puzzleSession) au monde extérieur :
// appels à la table de finales, délai de la réponse adverse, préchargement.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { applyMove, applyUci } from '../core/chessRules';
import { CONFIG, type ModeRules } from '../core/config';
import { chooseDefense } from '../core/judge/opponent';
import { judgeMove } from '../core/judge/tablebaseJudge';
import type { TablebaseLookup } from '../core/judge/tablebaseTypes';
import { initialSession, sessionReducer } from '../core/session/puzzleSession';
import type { PromotionPiece, Puzzle } from '../core/types';

export interface Timings {
  /** Temps entre le coup du joueur et le verdict affiché. */
  verdictMs: number | null;
  /** Temps de calcul de la réponse adverse (hors délai d'affichage). */
  opponentMs: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function usePuzzlePlayer(
  puzzle: Puzzle,
  rules: ModeRules,
  lookup: TablebaseLookup,
  prefetch: (fen: string) => void,
) {
  const [state, dispatch] = useReducer(sessionReducer, undefined, () => initialSession(puzzle, rules));
  const [timings, setTimings] = useState<Timings>({ verdictMs: null, opponentMs: null });
  // Jeton incrémenté à chaque nouveau puzzle / reset : les réponses réseau
  // arrivées trop tard pour un ancien puzzle sont ignorées.
  const token = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Un nouveau puzzle = nouveau composant (clé React) : ici, on précharge
  // seulement le verdict de la position de départ.
  useEffect(() => {
    prefetch(puzzle.fen);
    return () => {
      token.current += 1; // démontage : on ignore les réponses tardives
    };
  }, [puzzle, prefetch]);

  const reset = useCallback(() => {
    token.current += 1;
    setTimings({ verdictMs: null, opponentMs: null });
    dispatch({ type: 'RESET' });
  }, []);

  const playMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece): boolean => {
      const current = stateRef.current;
      if (current.phase !== 'awaitingPlayer' || current.puzzle !== puzzle) return false;
      const applied = applyMove(current.fen, from, to, promotion);
      if (!applied) return false; // coup illégal : la pièce revient, sans pénalité

      const myToken = token.current;
      const started = performance.now();
      // Le reducer étant pur, on calcule localement les états suivants pour
      // décider de la suite sans attendre le prochain rendu React.
      const afterPlayer = sessionReducer(current, { type: 'PLAYER_MOVED', move: applied });
      dispatch({ type: 'PLAYER_MOVED', move: applied });

      void (async () => {
        try {
          const before = await lookup(applied.fenBefore);
          if (token.current !== myToken) return;
          const verdict = judgeMove(before, applied.uci, {
            slowMoveToleranceMoves: CONFIG.judge.slowMoveToleranceMoves,
          });
          if (!verdict) throw new Error(`Coup ${applied.san} absent de la réponse de la table.`);
          const verdictMs = Math.round(performance.now() - started);
          setTimings((t) => ({ ...t, verdictMs }));
          dispatch({ type: 'VERDICT', verdict });
          const afterVerdict = sessionReducer(afterPlayer, { type: 'VERDICT', verdict });
          if (afterVerdict.phase !== 'opponentThinking') return; // puzzle terminé

          // Réponse adverse : défense la plus résistante.
          const opponentStart = performance.now();
          const after = await lookup(applied.fen);
          if (token.current !== myToken) return;
          const defense = chooseDefense(after);
          if (!defense) return;
          const reply = applyUci(applied.fen, defense.uci);
          if (!reply) throw new Error(`Réponse adverse illégale : ${defense.uci}`);
          const opponentMs = Math.round(performance.now() - opponentStart);
          setTimings((t) => ({ ...t, opponentMs }));
          const wait = CONFIG.ui.opponentMinDelayMs - (performance.now() - opponentStart);
          if (wait > 0) await sleep(wait);
          if (token.current !== myToken) return;
          dispatch({ type: 'OPPONENT_MOVED', move: reply });
          // Préchargement : le verdict du prochain coup du joueur sera instantané.
          prefetch(reply.fen);
        } catch (error) {
          if (token.current !== myToken) return;
          dispatch({ type: 'ERROR', message: error instanceof Error ? error.message : String(error) });
        }
      })();
      return true;
    },
    [lookup, prefetch, puzzle],
  );

  return { state, timings, playMove, reset };
}
