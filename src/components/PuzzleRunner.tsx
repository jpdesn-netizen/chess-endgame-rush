// Un puzzle en mode Rush : échiquier + état, et signal de fin au parent.

import { useEffect, useMemo, useRef } from 'react';
import { rushRules } from '../core/config';
import { parseUci } from '../core/fen';
import type { TablebaseLookup } from '../core/judge/tablebaseTypes';
import type { Puzzle } from '../core/types';
import { usePuzzlePlayer } from '../hooks/usePuzzlePlayer';
import { Board, type MarkTone } from './board/Board';
import { feedbackFor } from './hud/feedback';

export type PuzzleEnd = 'solved' | 'failed' | 'skipped';

interface Props {
  puzzle: Puzzle;
  active: boolean;
  lookup: TablebaseLookup;
  prefetch: (fen: string) => void;
  onEnd: (end: PuzzleEnd) => void;
}

export function PuzzleRunner({ puzzle, active, lookup, prefetch, onEnd }: Props) {
  const rules = useMemo(() => rushRules(puzzle.solution), [puzzle]);
  const { state, playMove } = usePuzzlePlayer(puzzle, rules, lookup, prefetch);
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    const end: PuzzleEnd | null =
      state.phase === 'solved' ? 'solved' : state.phase === 'failed' ? 'failed' : state.phase === 'error' ? 'skipped' : null;
    if (end) {
      reported.current = true;
      onEnd(end);
    }
  }, [state.phase, onEnd]);

  const marks = useMemo(() => {
    const list: { square: string; tone: MarkTone }[] = [];
    if (state.phase === 'failed' && state.verdict?.kind === 'bad' && state.lastMove) {
      list.push({ square: state.lastMove.to, tone: 'bad' });
      const hint = state.verdict.bestUci[0];
      if (hint) {
        const { from, to } = parseUci(hint);
        list.push({ square: from, tone: 'hint' }, { square: to, tone: 'hint' });
      }
    }
    if (state.phase === 'solved' && state.lastMove) list.push({ square: state.lastMove.to, tone: 'good' });
    return list;
  }, [state.phase, state.verdict, state.lastMove]);

  const feedback = feedbackFor(state);
  const turnIsWhite = state.fen.split(' ')[1] === 'w';

  return (
    <div className="flex flex-col gap-3">
      {import.meta.env.DEV && (
        // Mode développement uniquement : état lisible par les tests automatisés.
        <span hidden data-testid="cer-state" data-phase={state.phase} data-fen={state.fen} data-puzzle={puzzle.id} data-rating={puzzle.rating} />
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <span className={`rounded-full px-3 py-1 ${puzzle.objective === 'win' ? 'bg-amber-500 text-stone-900' : 'bg-sky-500 text-stone-900'}`}>
          {puzzle.objective === 'win' ? 'GAGNER' : 'TENIR LA NULLE'}
        </span>
        <span className="flex items-center gap-2 rounded-full bg-stone-800 px-3 py-1">
          <span className={`inline-block h-3 w-3 rounded-full border border-stone-500 ${turnIsWhite ? 'bg-white' : 'bg-stone-950'}`} />
          Au {turnIsWhite ? 'Blanc' : 'Noir'} de jouer
        </span>
        <span className="rounded-full bg-stone-800 px-3 py-1 text-stone-300">Elo {puzzle.rating}</span>
        <span className="rounded-full bg-stone-800 px-3 py-1 text-stone-300">
          coup {Math.min(state.playerMoveCount + (state.phase === 'awaitingPlayer' ? 1 : 0), rules.maxPlayerMoves ?? 0)} / {rules.maxPlayerMoves}
        </span>
      </div>
      <Board
        fen={state.fen}
        orientation={state.playerColor}
        interactive={active && state.phase === 'awaitingPlayer'}
        lastMove={state.lastMove}
        marks={marks}
        onMove={(from, to, promotion) => playMove(from, to, promotion)}
      />
      <p className="min-h-[1.5rem] text-sm text-stone-300" aria-live="polite">
        {feedback.title}
        {feedback.detail ? ` — ${feedback.detail}` : ''}
      </p>
    </div>
  );
}
