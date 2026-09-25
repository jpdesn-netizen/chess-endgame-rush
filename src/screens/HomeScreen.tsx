import { SUBCATEGORIES } from '../core/categories';
import { CONFIG } from '../core/config';
import { SOURCE_URL } from './PrivacyScreen';
import { sideToMove } from '../core/fen';
import { materialSignature } from '../core/material';
import type { RushMode } from '../core/rush/rushRules';
import type { Level, Puzzle } from '../core/types';
import { useState } from 'react';
import type { BestScore } from '../services/highScores';
import { isSoundOn, setSoundOn } from '../services/sound';

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
  /** Affichage compact (intégration dans un site). */
  compact?: boolean;
  mode: HomeMode;
  theme: ThemeChoice;
  /** Sous-thème (id) ou 'all'. */
  sub: string;
  /** Nombre de finales disponibles par sous-thème (id → n) et par famille. */
  counts: Map<string, number>;
  playerName: string | null;
  onProgress: () => void;
  onPrivacy: () => void;
  onSub: (s: string) => void;
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

const subChip = (active: boolean) =>
  `rounded-lg px-2.5 py-1 text-sm transition disabled:opacity-30 ${active ? 'bg-amber-500 text-stone-900' : 'bg-stone-800/70 text-stone-200 hover:bg-stone-700'}`;

function Count({ n }: { n?: number }) {
  return <span className="ml-1 text-xs opacity-60 tabular-nums">{n ?? 0}</span>;
}

const chip = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-sm font-semibold transition ${active ? 'bg-amber-500 text-stone-900' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'}`;

export function HomeScreen(p: Props) {
  const rush = p.mode !== 'training';
  const [sound, setSound] = useState(isSoundOn);
  return (
    <div className={`mx-auto max-w-5xl px-4 ${p.compact ? 'py-4' : 'py-8'}`}>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className={`font-extrabold text-stone-50 ${p.compact ? 'text-2xl' : 'text-3xl sm:text-4xl'}`}>♔ Chess Endgame Rush</h1>
          {!p.compact && <p className="mt-2 text-stone-400">Finales de parties réelles, jugées coup par coup (table de finales et Stockfish).</p>}
        </div>
        <div className="flex gap-2">
        <button
          type="button"
          onClick={p.onProgress}
          className="rounded-lg bg-stone-800 px-3 py-2 text-sm font-semibold text-stone-100 hover:bg-stone-700"
          title="Joueurs et progression"
        >
          👤 {p.playerName ?? 'Invité'} · 📈
        </button>
        <button
          type="button"
          onClick={() => {
            setSoundOn(!sound);
            setSound(!sound);
          }}
          className="rounded-lg bg-stone-800 px-3 py-2 text-lg hover:bg-stone-700"
          aria-label={sound ? 'Couper le son' : 'Activer le son'}
          title={sound ? 'Couper le son' : 'Activer le son'}
        >
          {sound ? '🔊' : '🔇'}
        </button>
        </div>
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
            {p.theme !== 'mix' && p.theme !== 'bases' && (
              <div className="mt-3 flex flex-wrap gap-2 border-l-2 border-stone-700 pl-3" aria-label="Sous-thèmes">
                <button type="button" className={subChip(p.sub === 'all')} onClick={() => p.onSub('all')}>
                  Tous <Count n={p.counts.get(p.theme)} />
                </button>
                {SUBCATEGORIES.filter((s) => s.family === p.theme && (p.counts.get(s.id) ?? 0) >= CONFIG.minPuzzlesPerTheme).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.title}
                    className={subChip(p.sub === s.id)}
                    onClick={() => p.onSub(s.id)}
                  >
                    <span className="text-base leading-none">{s.label}</span> <Count n={p.counts.get(s.id)} />
                  </button>
                ))}
                <button
                  type="button"
                  disabled={(p.counts.get(`${p.theme}-autres`) ?? 0) < CONFIG.minPuzzlesPerTheme}
                  className={subChip(p.sub === `${p.theme}-autres`)}
                  onClick={() => p.onSub(`${p.theme}-autres`)}
                >
                  Autres <Count n={p.counts.get(`${p.theme}-autres`)} />
                </button>
              </div>
            )}
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

      {!p.compact && (
        <footer className="mt-10 text-xs text-stone-500">
          Positions de parties réelles : base de puzzles Lichess (licence CC0). Jugement : table de finales Syzygy (API Lichess)
          et Stockfish. Échiquier : chessground (Lichess). Logiciel libre sous licence GPL v3.
          <div className="mt-2 flex flex-wrap gap-4">
            <button type="button" onClick={p.onPrivacy} className="text-sky-400 hover:underline">
              🔒 Données personnelles
            </button>
            {SOURCE_URL && (
              <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                Code source (GPL v3)
              </a>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
