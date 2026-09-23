import { CONFIG } from '../core/config';
import { sideToMove } from '../core/fen';
import { materialSignature } from '../core/material';
import type { RushMode } from '../core/rush/rushRules';
import type { Level, Puzzle } from '../core/types';
import type { BestScore } from '../services/highScores';

export type HomeMode = RushMode | 'training';
export type ThemeChoice = 'mix' | 'bases' | 'pions' | 'tours' | 'dames' | 'fous' | 'cavaliers' | 'mixte';

export const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'mix', label: '🎲 Mix' },
  { id: 'pions', label: '♟ Pions' },
  { id: 'tours', label: '♜ Tours' },
  { id: 'dames', label: '♛ Dames' },
  { id: 'fous', label: '♝ Fous' },
  { id: 'cavaliers', label: '♞ Cavaliers' },
  { id: 'mixte', label: '⚖ Mixtes' },
  { id: 'bases', label: '📘 Bases' },
];

const MODES: { id: HomeMode; icon: string; title: string; text: string }[] = [
  {
    id: 'storm',
    icon: '⚡',
    title: 'Storm',
    text: `${CONFIG.modes.storm.durationMs / 60000} min · +${CONFIG.modes.storm.bonusMs / 1000} s par réussite · −${CONFIG.modes.storm.penaltyMs / 1000} s par erreur`,
  },
  { id: 'streak', icon: '🔥', title: 'Streak', text: 'Difficulté croissante · la série s’arrête à la 1re erreur' },
  { id: 'training', icon: '📚', title: 'Entraînement', text: 'Positions « Bases », sans chrono, jusqu’au mat' },
];

const LEVEL_LABEL: Record<Level, string> = { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé', master: 'Master' };

interface Props {
  mode: HomeMode;
  theme: ThemeChoice;
  startRating: number;
  poolSize: number | null;
  loadError: string | null;
  best: BestScore | null;
  basics: Puzzle[];
  onMode: (m: HomeMode) => void;
  onTheme: (t: ThemeChoice) => void;
  onStartRating: (r: number) => void;
  onStart: () => void;
  onTrain: (index: number) => void;
}

const chip = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-sm font-semibold transition ${active ? 'bg-amber-500 text-stone-900' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'}`;

export function HomeScreen(p: Props) {
  const rush = p.mode !== 'training';
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-stone-50 sm:text-4xl">♔ Chess Endgame Rush</h1>
        <p className="mt-2 text-stone-400">Finales jugées coup par coup par la table de finales Lichess.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => p.onMode(m.id)}
            className={`rounded-xl p-4 text-left transition ${p.mode === m.id ? 'bg-amber-500 text-stone-900' : 'bg-stone-800 text-stone-100 hover:bg-stone-700'}`}
          >
            <div className="text-2xl font-black">
              {m.icon} {m.title}
            </div>
            <div className={`mt-1 text-sm ${p.mode === m.id ? 'text-stone-800' : 'text-stone-400'}`}>{m.text}</div>
          </button>
        ))}
      </section>

      {rush ? (
        <section className="mt-6 flex flex-col gap-5">
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-400">Thème</h2>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((t) => (
                <button key={t.id} type="button" className={chip(p.theme === t.id)} onClick={() => p.onTheme(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-400">Niveau de départ</h2>
            <div className="flex flex-wrap gap-2">
              {CONFIG.startLevels.map((l) => (
                <button key={l.id} type="button" className={chip(p.startRating === l.rating)} onClick={() => p.onStartRating(l.rating)}>
                  {l.label} ({l.rating})
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={!p.poolSize}
              onClick={p.onStart}
              className="rounded-xl bg-amber-500 px-8 py-4 text-xl font-black text-stone-900 hover:bg-amber-400 disabled:opacity-40"
            >
              ▶ Jouer
            </button>
            <span className="text-sm text-stone-400">
              {p.loadError ?? (p.poolSize === null ? 'Chargement des finales…' : `${p.poolSize} finales disponibles`)}
              {p.best && ` · Record : ${p.best.score} (${p.best.date})`}
            </span>
          </div>
        </section>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {p.basics.map((b, i) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => p.onTrain(i)}
                className="flex h-full w-full flex-col gap-2 rounded-xl bg-stone-800 p-4 text-left transition hover:bg-stone-700"
              >
                <span className="font-semibold text-stone-50">{b.title}</span>
                <span className="text-sm text-stone-400">{materialSignature(b.fen, sideToMove(b.fen))}</span>
                <span className="mt-auto flex flex-wrap gap-2 text-xs font-semibold">
                  <span className={`rounded-full px-2 py-0.5 ${b.objective === 'win' ? 'bg-amber-500 text-stone-900' : 'bg-sky-500 text-stone-900'}`}>
                    {b.objective === 'win' ? 'Gagner' : 'Tenir la nulle'}
                  </span>
                  <span className="rounded-full bg-stone-900 px-2 py-0.5 text-stone-300">{LEVEL_LABEL[b.level]}</span>
                  <span className="rounded-full bg-stone-900 px-2 py-0.5 text-stone-300">{sideToMove(b.fen) === 'w' ? 'Blancs' : 'Noirs'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-10 text-xs text-stone-500">
        Positions de parties réelles : base de puzzles Lichess (licence CC0). Jugement : table de finales Syzygy via l’API Lichess.
      </footer>
    </div>
  );
}
