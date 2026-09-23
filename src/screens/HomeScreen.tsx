import { sideToMove } from '../core/fen';
import { materialSignature } from '../core/material';
import type { Level, Puzzle } from '../core/types';

const LEVEL_LABEL: Record<Level, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
  master: 'Master',
};

export function HomeScreen({ puzzles, onPlay }: { puzzles: Puzzle[]; onPlay: (index: number) => void }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-stone-50 sm:text-4xl">♔ Chess Endgame Rush</h1>
        <p className="mt-2 text-stone-400">
          Jalon 1 · Collection « Bases » — {puzzles.length} positions, chaque coup jugé par la table de finales Lichess.
        </p>
        <button
          type="button"
          onClick={() => onPlay(0)}
          className="mt-5 rounded-lg bg-amber-500 px-5 py-3 font-bold text-stone-900 hover:bg-amber-400"
        >
          ▶ Tout enchaîner
        </button>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {puzzles.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPlay(i)}
              className="flex h-full w-full flex-col gap-2 rounded-xl bg-stone-800 p-4 text-left transition hover:bg-stone-700"
            >
              <span className="font-semibold text-stone-50">{p.title}</span>
              <span className="text-sm text-stone-400">{materialSignature(p.fen, sideToMove(p.fen))}</span>
              <span className="mt-auto flex flex-wrap gap-2 text-xs font-semibold">
                <span className={`rounded-full px-2 py-0.5 ${p.objective === 'win' ? 'bg-amber-500 text-stone-900' : 'bg-sky-500 text-stone-900'}`}>
                  {p.objective === 'win' ? 'Gagner' : 'Tenir la nulle'}
                </span>
                <span className="rounded-full bg-stone-900 px-2 py-0.5 text-stone-300">{LEVEL_LABEL[p.level]}</span>
                <span className="rounded-full bg-stone-900 px-2 py-0.5 text-stone-300">
                  {sideToMove(p.fen) === 'w' ? 'Blancs' : 'Noirs'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
