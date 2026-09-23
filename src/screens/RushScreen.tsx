// Modes Rush : Storm (chrono) et Streak (série). Les règles de score et de
// temps sont dans core/rush/rushRules.ts ; ici, uniquement l'orchestration.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PuzzleRunner, type PuzzleEnd } from '../components/PuzzleRunner';
import { CONFIG } from '../core/config';
import { outcomeOf } from '../core/judge/outcome';
import type { TablebaseLookup } from '../core/judge/tablebaseTypes';
import { remainingMs, rushReducer, startRush, targetRating, type RushMode, type RushState } from '../core/rush/rushRules';
import { pickNext } from '../core/rush/selector';
import type { Puzzle } from '../core/types';
import { submitScore, type BestScore } from '../services/highScores';

interface Props {
  mode: RushMode;
  pool: Puzzle[];
  startRating: number;
  scoreKey: string;
  lookup: TablebaseLookup;
  prefetch: (fen: string) => void;
  onRestart: () => void;
  onHome: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function formatTime(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function RushScreen({ mode, pool, startRating, scoreKey, lookup, prefetch, onRestart, onHome }: Props) {
  const [rush, setRush] = useState<RushState | null>(null);
  const [current, setCurrent] = useState<Puzzle | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ isRecord: boolean; previous: BestScore | null } | null>(null);
  const excluded = useRef(new Set<string>());
  const nextPuzzle = useRef<Promise<Puzzle | null> | null>(null);
  const rushRef = useRef<RushState | null>(null);
  rushRef.current = rush;

  /** Tire un puzzle et vérifie avec la table que l'objectif annoncé est juste. */
  const findPlayable = useCallback(
    async (target: number): Promise<Puzzle | null> => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = pickNext(pool, target, excluded.current);
        if (!candidate) return null;
        excluded.current.add(candidate.id);
        const tb = await lookup(candidate.fen);
        const expected = candidate.objective === 'win' ? 'win' : 'draw';
        if (outcomeOf(tb.category) === expected) return candidate;
      }
      return null;
    },
    [pool, lookup],
  );

  // Démarrage : le chrono ne part qu'une fois le premier puzzle prêt.
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
        const started = startRush(mode, startRating, Date.now());
        setRush(started);
        setCurrent(first);
        nextPuzzle.current = findPlayable(targetRating(started) + (mode === 'storm' ? CONFIG.modes.storm.eloStep : CONFIG.modes.streak.eloStep));
      } catch (error) {
        if (!cancelled) setProblem(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [findPlayable, mode, startRating]);

  // Horloge (Storm) : on rafraîchit l'affichage et on détecte la fin du temps.
  useEffect(() => {
    if (!rush || rush.status === 'over' || rush.mode !== 'storm') return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      setRush((r) => (r ? rushReducer(r, { type: 'TICK', now: t }) : r));
    }, 100);
    return () => window.clearInterval(id);
  }, [rush?.status, rush?.mode]);

  // Fin de partie : enregistrement du record.
  useEffect(() => {
    if (rush?.status === 'over' && !result) setResult(submitScore(scoreKey, rush.score));
  }, [rush?.status, rush?.score, result, scoreKey]);

  const onEnd = useCallback(
    async (end: PuzzleEnd) => {
      const state = rushRef.current;
      if (!state || state.status === 'over' || !current) return;
      let next = state;
      if (end !== 'skipped') {
        const entry = { puzzleId: current.id, rating: current.rating, success: end === 'solved', gameUrl: current.gameUrl, title: current.title };
        next = rushReducer(state, { type: end === 'solved' ? 'SOLVED' : 'FAILED', now: Date.now(), entry });
        setRush(next);
        if (next.status === 'over') return;
      }
      await sleep(end === 'solved' ? CONFIG.modes.rushPauseAfterSuccessMs : CONFIG.modes.rushPauseAfterFailureMs);
      try {
        const upcoming = await (nextPuzzle.current ?? findPlayable(targetRating(next)));
        if (rushRef.current?.status === 'over') return;
        if (!upcoming) {
          setRush((r) => (r ? { ...r, status: 'over' } : r));
          setProblem('Plus de puzzles disponibles pour ce choix : partie terminée.');
          return;
        }
        setCurrent(upcoming);
        nextPuzzle.current = findPlayable(targetRating(next) + (mode === 'storm' ? CONFIG.modes.storm.eloStep : CONFIG.modes.streak.eloStep));
      } catch (error) {
        setProblem(error instanceof Error ? error.message : String(error));
        setRush((r) => (r ? { ...r, status: 'over' } : r));
      }
    },
    [current, findPlayable, mode],
  );

  const left = rush ? remainingMs(rush, now) : null;
  const over = rush?.status === 'over';
  const timeRatio = left === null ? 1 : Math.min(1, left / CONFIG.modes.storm.durationMs);

  if (!rush || !current) {
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-4 lg:flex-row lg:items-start">
      <div className="w-full lg:w-[min(640px,60vw)] shrink-0">
        <PuzzleRunner key={current.id} puzzle={current} active={!over} lookup={lookup} prefetch={prefetch} onEnd={onEnd} />
      </div>

      <aside className="flex w-full flex-col gap-4">
        {/* Tableau de score */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-stone-800 p-4 text-center">
            <div className="text-5xl font-black text-amber-400 tabular-nums" data-testid="score">
              {rush.score}
            </div>
            <div className="text-xs uppercase tracking-wide text-stone-400">{mode === 'storm' ? 'Score' : 'Série'}</div>
          </div>
          {mode === 'storm' ? (
            <div className="rounded-xl bg-stone-800 p-4 text-center">
              <div className={`text-5xl font-black tabular-nums ${left !== null && left < 30_000 ? 'text-red-400' : 'text-stone-50'}`} data-testid="timer">
                {formatTime(left ?? 0)}
              </div>
              <div className="text-xs uppercase tracking-wide text-stone-400">Temps restant</div>
            </div>
          ) : (
            <div className="rounded-xl bg-stone-800 p-4 text-center">
              <div className="text-5xl font-black text-stone-50 tabular-nums">{targetRating(rush)}</div>
              <div className="text-xs uppercase tracking-wide text-stone-400">Niveau visé (Elo)</div>
            </div>
          )}
        </div>

        {mode === 'storm' && (
          <div className="h-3 overflow-hidden rounded-full bg-stone-800" aria-hidden>
            <div
              className={`h-full transition-[width] duration-100 ${timeRatio < 0.17 ? 'bg-red-500' : 'bg-amber-500'}`}
              style={{ width: `${timeRatio * 100}%` }}
            />
          </div>
        )}

        <div className="flex gap-3 text-sm text-stone-300">
          <span className="rounded-full bg-stone-800 px-3 py-1">🔥 Combo {rush.combo}</span>
          {mode === 'storm' && <span className="rounded-full bg-stone-800 px-3 py-1">❌ Erreurs {rush.errors}</span>}
          <span className="rounded-full bg-stone-800 px-3 py-1">
            {mode === 'storm'
              ? `+${CONFIG.modes.storm.bonusMs / 1000} s / −${CONFIG.modes.storm.penaltyMs / 1000} s`
              : 'Arrêt à la 1re erreur'}
          </span>
        </div>

        {/* Historique en pastilles */}
        <div className="flex flex-wrap gap-1">
          {rush.history.map((h, i) => (
            <span key={i} title={`${h.title} · Elo ${h.rating}`} className={`h-3 w-3 rounded-sm ${h.success ? 'bg-emerald-500' : 'bg-red-500'}`} />
          ))}
        </div>

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
        Score : <strong className="text-amber-400">{rush.score}</strong>
        {result?.isRecord && <span className="ml-2 font-semibold text-emerald-400">🎉 Nouveau record !</span>}
        {!result?.isRecord && result?.previous && <span className="ml-2 text-stone-400">(record : {result.previous.score})</span>}
      </p>
      <p className="text-sm text-stone-400">
        Meilleur combo : {rush.bestCombo} · Erreurs : {rush.errors}
        {best !== null && ` · Puzzle le plus difficile réussi : ${best}`}
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
        <button type="button" onClick={onRestart} className="rounded-lg bg-amber-500 px-4 py-2 font-bold text-stone-900 hover:bg-amber-400">
          ↻ Rejouer
        </button>
        <button type="button" onClick={onHome} className="rounded-lg bg-stone-700 px-4 py-2 font-semibold text-stone-100 hover:bg-stone-600">
          Accueil
        </button>
      </div>
    </div>
  );
}
