// Modes Rush : Storm (chrono) et Streak (série). Les règles de score et de
// temps sont dans core/rush/rushRules.ts ; ici, uniquement l'orchestration.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PuzzleRunner, type PuzzleEnd } from '../components/PuzzleRunner';
import { CONFIG } from '../core/config';
import { remainingMs, rushReducer, startRush, targetRating, type RushMode, type RushState } from '../core/rush/rushRules';
import { pickNext } from '../core/rush/selector';
import type { Puzzle } from '../core/types';
import { notifyParent } from '../embed';
import { submitScore, type BestScore } from '../services/highScores';
import type { MoveJudge } from '../services/moveJudge';

interface Props {
  mode: RushMode;
  pool: Puzzle[];
  theme: string;
  startRating: number;
  scoreKey: string;
  judge: MoveJudge;
  /** Archivage (profil joueur) : un puzzle terminé. */
  onAttempt?: (puzzle: Puzzle, success: boolean) => void;
  /** Archivage : une partie terminée. */
  /** Puzzles joués lors des parties récentes : évités tant qu'il reste du choix. */
  recentlySeen?: ReadonlySet<string>;
  onRunEnd?: (run: { mode: RushMode; theme: string; level: number; score: number; errors: number; bestCombo: number; highest?: number; played?: number; moves?: number; durationMs?: number }) => void;
  onRestart: () => void;
  onHome: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const eloStep = (mode: RushMode) => (mode === 'storm' ? CONFIG.modes.storm.eloStep : CONFIG.modes.streak.eloStep);

function formatTime(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Puzzle suivant préparé en avance : son éventuel échec (réseau coupé) est
 * traité quand on l'attend, pas signalé comme erreur non gérée entre-temps.
 */
function preload<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

export function RushScreen({ mode, pool, theme, startRating, scoreKey, judge, recentlySeen, onAttempt, onRunEnd, onRestart, onHome }: Props) {
  const [rush, setRush] = useState<RushState>(() => startRush(mode, startRating));
  const [current, setCurrent] = useState<Puzzle | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ isRecord: boolean; previous: BestScore | null } | null>(null);
  const excluded = useRef(new Set<string>()); // puzzles déjà servis dans CETTE partie : jamais redonnés
  const lastSub = useRef<string | undefined>(undefined);
  const nextPuzzle = useRef<Promise<Puzzle | null> | null>(null);
  const rushRef = useRef(rush);
  rushRef.current = rush;
  const movesRef = useRef(0); // coups joués (précision façon Lichess)
  const startedAtRef = useRef<number | null>(null);

  /** Tire un puzzle et vérifie (table ou moteur) que l'objectif annoncé est juste. */
  const findPlayable = useCallback(
    async (target: number): Promise<Puzzle | null> => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = pickNext(pool, target, excluded.current, Math.random, {
          previousSubcategory: lastSub.current,
          recentlySeen,
        });
        if (!candidate) return null;
        excluded.current.add(candidate.id);
        if (await judge.check(candidate.fen, candidate.objective)) {
          // Préchargement : le premier verdict sera immédiat.
          judge.prefetch(candidate.fen, { objective: candidate.objective, previousUci: [], solution: candidate.solution });
          lastSub.current = candidate.subcategory;
          return candidate;
        }
      }
      return null;
    },
    [pool, judge, recentlySeen],
  );

  // Préparation du premier puzzle. Le chrono attend le premier coup du joueur.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await findPlayable(startRating);
        if (cancelled) return;
        if (!first) {
          setProblem('Aucun puzzle disponible pour ce choix.');
          return;
        }
        setCurrent(first);
        nextPuzzle.current = preload(findPlayable(startRating + eloStep(mode)));
      } catch (error) {
        if (!cancelled) setProblem(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [findPlayable, mode, startRating]);

  // Horloge (Storm, une fois démarrée).
  useEffect(() => {
    if (rush.status !== 'running' || rush.mode !== 'storm') return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      setRush((r) => rushReducer(r, { type: 'TICK', now: t }));
    }, 100);
    return () => window.clearInterval(id);
  }, [rush.status, rush.mode]);

  // Fin de partie : record + message au site parent (intégration).
  useEffect(() => {
    if (rush.status !== 'over' || result) return;
    setResult(submitScore(scoreKey, rush.score));
    const solvedRatings = rush.history.filter((h) => h.success).map((h) => h.rating);
    const run = {
      mode,
      theme,
      level: startRating,
      score: rush.score,
      bestCombo: rush.bestCombo,
      errors: rush.errors,
      highest: solvedRatings.length ? Math.max(...solvedRatings) : undefined,
      played: rush.history.length,
      moves: movesRef.current,
      durationMs:
        startedAtRef.current === null
          ? undefined
          : Math.max(0, Math.min(Date.now(), rush.endsAt ?? Infinity) - startedAtRef.current),
    };
    notifyParent(run);
    if (rush.history.length > 0) onRunEnd?.(run);
  }, [rush, result, scoreKey, mode, theme, startRating, onRunEnd]);

  const onPlayerMove = useCallback(() => {
    if (rushRef.current.status !== 'over') movesRef.current += 1;
    if (rushRef.current.status === 'waiting') {
      const t = Date.now();
      startedAtRef.current = t;
      setNow(t);
      setRush((r) => rushReducer(r, { type: 'START', now: t }));
    }
  }, []);

  const onEnd = useCallback(
    async (end: PuzzleEnd) => {
      const state = rushRef.current;
      if (state.status === 'over' || !current) return;
      let next = state;
      if (end !== 'skipped') {
        const entry = { puzzleId: current.id, rating: current.rating, success: end === 'solved', gameUrl: current.gameUrl, title: current.title };
        next = rushReducer(state, { type: end === 'solved' ? 'SOLVED' : 'FAILED', now: Date.now(), entry });
        setRush(next);
        if (next.history.length > state.history.length) onAttempt?.(current, end === 'solved');
        if (next.status === 'over') return;
      }
      await sleep(end === 'solved' ? CONFIG.modes.rushPauseAfterSuccessMs : CONFIG.modes.rushPauseAfterFailureMs);
      try {
        const upcoming = await (nextPuzzle.current ?? findPlayable(targetRating(next)));
        if (rushRef.current.status === 'over') return;
        if (!upcoming) {
          setRush((r) => ({ ...r, status: 'over' }));
          setProblem('Plus de puzzles disponibles pour ce choix : partie terminée.');
          return;
        }
        setCurrent(upcoming);
        nextPuzzle.current = preload(findPlayable(targetRating(next) + eloStep(mode)));
      } catch (error) {
        setProblem(error instanceof Error ? error.message : String(error));
        setRush((r) => ({ ...r, status: 'over' }));
      }
    },
    [current, findPlayable, mode, onAttempt],
  );

  const left = remainingMs(rush, now);
  const over = rush.status === 'over';
  const timeRatio = left === null ? 1 : Math.min(1, left / CONFIG.modes.storm.durationMs);
  const waiting = rush.status === 'waiting';

  if (!current) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center text-stone-300">
        {problem ?? 'Préparation des puzzles…'}
        {problem && (
          <button type="button" onClick={onHome} className="mt-6 block w-full rounded-lg bg-stone-700 px-4 py-2">
            ← Accueil
          </button>
        )}
      </div>
    );
  }

  const scoreboard = (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 rounded-xl bg-stone-800 px-3 py-2 text-center">
        <div className="text-4xl font-black leading-tight text-amber-400 tabular-nums sm:text-5xl" data-testid="score">
          {rush.score}
        </div>
        <div className="text-[11px] uppercase tracking-wide text-stone-400">{mode === 'storm' ? 'Score' : 'Série'}</div>
      </div>
      {mode === 'storm' ? (
        <div className="flex-1 rounded-xl bg-stone-800 px-3 py-2 text-center">
          <div
            className={`text-4xl font-black leading-tight tabular-nums sm:text-5xl ${!waiting && left !== null && left < 30_000 ? 'text-red-400' : 'text-stone-50'}`}
            data-testid="timer"
          >
            {formatTime(left ?? 0)}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-stone-400">{waiting ? 'En attente' : 'Temps'}</div>
        </div>
      ) : (
        <div className="flex-1 rounded-xl bg-stone-800 px-3 py-2 text-center">
          <div className="text-4xl font-black leading-tight text-stone-50 tabular-nums sm:text-5xl">{targetRating(rush)}</div>
          <div className="text-[11px] uppercase tracking-wide text-stone-400">Elo visé</div>
        </div>
      )}
      <div className="flex-1 rounded-xl bg-stone-800 px-3 py-2 text-center">
        <div className="text-4xl font-black leading-tight text-orange-400 tabular-nums sm:text-5xl">{rush.combo}</div>
        <div className="text-[11px] uppercase tracking-wide text-stone-400">Combo</div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-3 py-3 lg:flex-row lg:items-start lg:gap-6 lg:px-4">
      {/* Échiquier : toujours entièrement visible dans la hauteur de l'écran. */}
      <div className="order-2 mx-auto w-full lg:order-1" style={{ maxWidth: 'min(100%, calc(100dvh - 190px), 720px)' }}>
        <PuzzleRunner
          key={current.id}
          puzzle={current}
          active={!over}
          judge={judge}
          onEnd={onEnd}
          onPlayerMove={onPlayerMove}
          banner={waiting ? (mode === 'storm' ? '⏱ Le chrono démarre à ton premier coup.' : '🔥 Joue ton premier coup pour commencer la série.') : null}
        />
      </div>

      <aside className="order-1 flex w-full flex-col gap-3 lg:order-2 lg:max-w-sm">
        {scoreboard}
        {mode === 'storm' && (
          <div className="h-2 overflow-hidden rounded-full bg-stone-800" aria-hidden>
            <div
              className={`h-full transition-[width] duration-100 ${timeRatio < 0.17 ? 'bg-red-500' : 'bg-amber-500'}`}
              style={{ width: `${timeRatio * 100}%` }}
            />
          </div>
        )}
        <div className="hidden flex-wrap gap-1 sm:flex">
          {rush.history.map((h, i) => (
            <span key={i} title={`${h.title} · Elo ${h.rating}`} className={`h-3 w-3 rounded-sm ${h.success ? 'bg-emerald-500' : 'bg-red-500'}`} />
          ))}
        </div>
        <p className="hidden text-xs text-stone-500 lg:block">
          {mode === 'storm'
            ? `+${CONFIG.modes.storm.bonusMs / 1000} s par réussite · −${CONFIG.modes.storm.penaltyMs / 1000} s par erreur`
            : 'La série s’arrête à la première erreur'}
          {rush.errors > 0 && ` · ${rush.errors} erreur${rush.errors > 1 ? 's' : ''}`}
        </p>
        {over ? (
          <ResultPanel rush={rush} result={result} problem={problem} onRestart={onRestart} onHome={onHome} />
        ) : (
          <button type="button" onClick={onHome} className="self-start text-sm text-stone-400 hover:text-stone-100">
            Abandonner
          </button>
        )}
      </aside>
    </div>
  );
}

function ResultPanel({
  rush,
  result,
  problem,
  onRestart,
  onHome,
}: {
  rush: RushState;
  result: { isRecord: boolean; previous: BestScore | null } | null;
  problem: string | null;
  onRestart: () => void;
  onHome: () => void;
}) {
  const solved = rush.history.filter((h) => h.success);
  const best = solved.length ? Math.max(...solved.map((h) => h.rating)) : null;
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-stone-800 p-4" data-testid="result">
      <h2 className="text-xl font-bold text-stone-50">{rush.mode === 'storm' ? '⏱ Temps écoulé !' : '💥 Série terminée'}</h2>
      {problem && <p className="text-sm text-amber-300">{problem}</p>}
      <p className="text-stone-200">
        Score : <strong className="text-2xl text-amber-400">{rush.score}</strong>
        {result?.isRecord && <span className="ml-2 font-semibold text-emerald-400">🎉 Nouveau record !</span>}
        {!result?.isRecord && result?.previous && <span className="ml-2 text-stone-400">(record : {result.previous.score})</span>}
      </p>
      <p className="text-sm text-stone-400">
        Meilleur combo : {rush.bestCombo} · Erreurs : {rush.errors}
        {best !== null && ` · Plus difficile réussi : ${best}`}
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
        {rush.history.map((h, i) => (
          <li key={i} className="flex items-center gap-2">
            <span>{h.success ? '✅' : '❌'}</span>
            <span className="text-stone-300">
              {h.title} · {h.rating}
            </span>
            {h.gameUrl && (
              <a href={h.gameUrl} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                partie
              </a>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-3">
        <button type="button" onClick={onRestart} className="flex-1 rounded-lg bg-amber-500 px-4 py-2 font-bold text-stone-900 hover:bg-amber-400">
          ↻ Rejouer
        </button>
        <button type="button" onClick={onHome} className="flex-1 rounded-lg bg-stone-700 px-4 py-2 font-semibold text-stone-100 hover:bg-stone-600">
          Accueil
        </button>
      </div>
    </div>
  );
}
