import { useMemo } from 'react';
import { Board, type MarkTone } from '../components/board/Board';
import { feedbackFor, type Tone } from '../components/hud/feedback';
import { TRAINING_RULES } from '../core/config';
import { parseUci } from '../core/fen';
import { materialSignature } from '../core/material';
import type { Puzzle } from '../core/types';
import { usePuzzlePlayer } from '../hooks/usePuzzlePlayer';
import type { MoveJudge } from '../services/moveJudge';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-stone-800 text-stone-100',
  good: 'bg-emerald-900/70 text-emerald-100',
  bad: 'bg-red-900/70 text-red-100',
  warn: 'bg-amber-900/70 text-amber-100',
  success: 'bg-emerald-600 text-white',
};

interface Props {
  puzzle: Puzzle;
  position: { index: number; total: number };
  judge: MoveJudge;
  onNext: () => void;
  onHome: () => void;
}

export function GameScreen({ puzzle, position, judge, onNext, onHome }: Props) {
  const { state, timings, playMove, reset } = usePuzzlePlayer(puzzle, TRAINING_RULES, judge);
  const feedback = feedbackFor(state);
  const playerIsWhite = state.playerColor === 'w';
  const turnIsWhite = state.fen.split(' ')[1] === 'w';
  const finished = state.phase === 'solved' || state.phase === 'failed' || state.phase === 'error';

  const marks = useMemo(() => {
    const list: { square: string; tone: MarkTone }[] = [];
    if (state.phase === 'failed' && state.verdict?.kind === 'bad' && state.lastMove) {
      list.push({ square: state.lastMove.to, tone: 'bad' });
    }
    return list;
  }, [state.phase, state.verdict, state.lastMove]);
  const arrow = state.phase === 'failed' && state.verdict?.kind === 'bad' && state.verdict.bestUci[0] ? parseUci(state.verdict.bestUci[0]) : null;

  // Numérotation des coups à partir du FEN de départ.
  const startMoveNumber = Number(puzzle.fen.split(' ')[5] ?? 1);
  const startsBlack = puzzle.fen.split(' ')[1] === 'b';
  const moveList = state.moves.map((m, i) => {
    const ply = i + (startsBlack ? 1 : 0);
    const number = startMoveNumber + Math.floor(ply / 2);
    const prefix = ply % 2 === 0 ? `${number}.` : i === 0 ? `${number}…` : '';
    return { ...m, label: `${prefix} ${m.san}`.trim() };
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
      <div className="mx-auto w-full shrink-0 lg:mx-0 lg:w-[min(680px,60vw)]" style={{ maxWidth: 'min(100%, calc(100dvh - 120px))' }}>
        <Board
          fen={state.fen}
          orientation={state.playerColor}
          interactive={state.phase === 'awaitingPlayer'}
          lastMove={state.lastMove}
          marks={marks}
          arrow={arrow}
          onMove={(from, to, promotion) => playMove(from, to, promotion)}
        />
      </div>

      <aside className="flex w-full flex-col gap-4">
        <div className="flex items-center justify-between text-sm text-stone-400">
          <button type="button" onClick={onHome} className="hover:text-stone-100">
            ← Toutes les positions
          </button>
          <span>
            {position.index + 1} / {position.total}
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-stone-50">{puzzle.title}</h1>
          <p className="mt-1 text-sm text-stone-400">{materialSignature(puzzle.fen, state.playerColor)}</p>
        </div>

        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          <span className={`rounded-full px-3 py-1 ${puzzle.objective === 'win' ? 'bg-amber-500 text-stone-900' : 'bg-sky-500 text-stone-900'}`}>
            Objectif : {puzzle.objective === 'win' ? 'GAGNER' : 'TENIR LA NULLE'}
          </span>
          <span className="flex items-center gap-2 rounded-full bg-stone-800 px-3 py-1 text-stone-100">
            <span className={`inline-block h-3 w-3 rounded-full border border-stone-500 ${turnIsWhite ? 'bg-white' : 'bg-stone-950'}`} />
            {finished ? 'Terminé' : `Au ${turnIsWhite ? 'Blanc' : 'Noir'} de jouer`}
          </span>
          <span className="rounded-full bg-stone-800 px-3 py-1 text-stone-300">
            Tu joues les {playerIsWhite ? 'Blancs' : 'Noirs'} · coup {state.playerMoveCount}
            {puzzle.objective === 'draw' ? ` / ${TRAINING_RULES.drawHoldMoves}` : ''}
          </span>
        </div>

        <div className={`rounded-xl px-4 py-3 ${TONE_CLASS[feedback.tone]}`} role="status" aria-live="polite">
          <p className="font-semibold">{feedback.title}</p>
          {feedback.detail && <p className="mt-1 text-sm opacity-90">{feedback.detail}</p>}
        </div>

        <p className="rounded-xl bg-stone-800/60 px-4 py-3 text-sm text-stone-300">💡 {puzzle.concept}</p>

        {moveList.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-sm text-stone-300">
            {moveList.map((m, i) => (
              <span key={i} className={m.by === 'player' ? 'text-stone-50' : 'text-stone-400'}>
                {m.label}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={reset} className="rounded-lg bg-stone-700 px-4 py-2 font-semibold text-stone-100 hover:bg-stone-600">
            ↺ Recommencer
          </button>
          <button
            type="button"
            onClick={onNext}
            className={`rounded-lg px-4 py-2 font-semibold ${finished ? 'bg-amber-500 text-stone-900 hover:bg-amber-400' : 'bg-stone-700 text-stone-100 hover:bg-stone-600'}`}
          >
            Suivant →
          </button>
        </div>

        <p className="text-xs text-stone-500">
          Verdict : {timings.verdictMs ?? '–'} ms · Réponse adverse : {timings.opponentMs ?? '–'} ms
          {timings.source && ` (${timings.source === 'tablebase' ? 'table de finales' : 'Stockfish'})`}
        </p>
      </aside>
    </div>
  );
}
