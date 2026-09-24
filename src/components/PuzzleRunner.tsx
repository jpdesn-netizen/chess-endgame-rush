// Un puzzle en mode Rush : échiquier + ligne d'état, et signal de fin au parent.

import { useEffect, useMemo, useRef } from 'react';
import { rushRules } from '../core/config';
import { parseUci } from '../core/fen';
import type { Puzzle } from '../core/types';
import { usePuzzlePlayer } from '../hooks/usePuzzlePlayer';
import type { MoveJudge } from '../services/moveJudge';
import { Board, type MarkTone } from './board/Board';
import { feedbackFor, type Tone } from './hud/feedback';

export type PuzzleEnd = 'solved' | 'failed' | 'skipped';

interface Props {
  puzzle: Puzzle;
  active: boolean;
  judge: MoveJudge;
  onEnd: (end: PuzzleEnd) => void;
  onPlayerMove?: () => void;
  /** Message affiché à la place de l'état (ex. « le chrono démarre au premier coup »). */
  banner?: string | null;
}

const TONE: Record<Tone, string> = {
  neutral: 'text-stone-200',
  good: 'text-emerald-300',
  bad: 'text-red-300',
  warn: 'text-amber-300',
  success: 'text-emerald-300',
};

export function PuzzleRunner({ puzzle, active, judge, onEnd, onPlayerMove, banner }: Props) {
  const rules = useMemo(() => rushRules(puzzle.solution), [puzzle]);
  const { state, playMove } = usePuzzlePlayer(puzzle, rules, judge, onPlayerMove);
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

  const failedBad = state.phase === 'failed' && state.verdict?.kind === 'bad' ? state.verdict : null;
  const marks = useMemo(() => {
    const list: { square: string; tone: MarkTone }[] = [];
    if (failedBad && state.lastMove) list.push({ square: state.lastMove.to, tone: 'bad' });
    if (state.phase === 'solved' && state.lastMove) list.push({ square: state.lastMove.to, tone: 'good' });
    return list;
  }, [failedBad, state.phase, state.lastMove]);
  const arrow = failedBad?.bestUci[0] ? parseUci(failedBad.bestUci[0]) : null;

  const feedback = feedbackFor(state);
  const playerWhite = state.playerColor === 'w';

  return (
    <div className="flex flex-col gap-2">
      {import.meta.env.DEV && (
        // Mode développement uniquement : état lisible par les tests automatisés.
        <span hidden data-testid="cer-state" data-phase={state.phase} data-fen={state.fen} data-puzzle={puzzle.id} data-rating={puzzle.rating} data-orientation={state.playerColor} />
      )}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <span className={`inline-block h-4 w-4 rounded-full border-2 border-stone-400 ${playerWhite ? 'bg-white' : 'bg-stone-950'}`} />
          {playerWhite ? 'Blancs' : 'Noirs'} :{' '}
          <span className={puzzle.objective === 'win' ? 'text-amber-400' : 'text-sky-400'}>
            {puzzle.objective === 'win' ? 'gagner' : 'tenir la nulle'}
          </span>
        </span>
        <span className="text-stone-400">
          <span title={puzzle.ratingEstimated ? 'Elo estimé : exercice généré, pas encore noté par Lichess' : 'Elo Lichess'}>
            Elo {puzzle.ratingEstimated ? '≈' : ''}
            {puzzle.rating}
          </span>{' '}
          · coup {Math.min(state.playerMoveCount + (state.phase === 'awaitingPlayer' ? 1 : 0), rules.maxPlayerMoves ?? 1)}/
          {rules.maxPlayerMoves}
        </span>
      </div>
      <Board
        fen={state.fen}
        orientation={state.playerColor}
        interactive={active && state.phase === 'awaitingPlayer'}
        lastMove={state.lastMove}
        marks={marks}
        arrow={arrow}
        onMove={(from, to, promotion) => playMove(from, to, promotion)}
      />
      <p className={`min-h-[1.5rem] text-sm font-medium ${banner ? 'text-amber-300' : TONE[feedback.tone]}`} aria-live="polite">
        {banner ?? `${feedback.title}${feedback.detail ? ` — ${feedback.detail}` : ''}`}
      </p>
    </div>
  );
}
