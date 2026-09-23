// Taux de réussite par sous-thème, du plus faible au plus fort.
// Barres horizontales fines (≤ 24 px), extrémité arrondie de 4 px, valeur en
// texte (jamais dans la couleur de la donnée), infobulle au survol.

import type { CategoryStat } from '../../core/stats';

const BAR = '#d97706';
const TRACK = '#292524';

export function CategoryBars({
  stats,
  onTrain,
}: {
  stats: CategoryStat[];
  onTrain?: (stat: CategoryStat) => void;
}) {
  if (stats.length === 0) {
    return <p className="rounded-xl bg-stone-800 p-6 text-center text-sm text-stone-400">Pas encore assez de puzzles joués pour ce choix.</p>;
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Taux de réussite par sous-thème">
      {stats.map((s) => (
        <li key={s.id} className="group grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[10rem_1fr_auto]" title={`${s.title} — ${s.success}/${s.attempts} réussis, Elo moyen ${s.avgRating}`}>
          <span className="truncate text-sm text-stone-200">
            <span className="mr-1 text-base">{s.label}</span>
          </span>
          <div className="h-4 rounded-[4px]" style={{ background: TRACK }}>
            <div className="h-4 rounded-r-[4px]" style={{ width: `${Math.max(2, s.rate * 100)}%`, background: BAR }} />
          </div>
          <span className="flex items-center gap-2 text-sm tabular-nums text-stone-300">
            {Math.round(s.rate * 100)} %<span className="text-xs text-stone-500">({s.attempts})</span>
            {onTrain && (
              <button
                type="button"
                onClick={() => onTrain(s)}
                className="rounded-md bg-stone-700 px-2 py-0.5 text-xs text-stone-100 hover:bg-amber-600"
                title={`S'entraîner : ${s.title}`}
              >
                ▶
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
