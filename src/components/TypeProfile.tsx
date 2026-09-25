// Profil par type de finale : deux radars (précision, niveau atteint) et un
// classement du plus faible au plus fort. Échelles séparées : jamais deux
// mesures sur un même axe.

import { useMemo, useState } from 'react';
import { FAMILY_ORDER, filterAttempts, typeProfile, type AttemptLike, type TypeStat } from '../core/stats';
import { FAMILY_LABEL } from '../core/material';
import type { Family } from '../core/types';
import { RadarChart, type RadarAxis } from './charts/RadarChart';

const MIN_ATTEMPTS = 3; // en dessous, le type n'est pas placé sur le radar

const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-sm font-semibold transition ${active ? 'bg-amber-500 text-stone-900' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'}`;

const MODES = [
  { id: 'storm', label: 'Storm' },
  { id: 'streak', label: 'Streak' },
  { id: 'training', label: 'Entraînement' },
  { id: 'review', label: 'Révision' },
  { id: '', label: 'Tous modes' },
];
const PERIODS = [
  { id: 0, label: 'Tout' },
  { id: 30, label: '30 jours' },
  { id: 7, label: '7 jours' },
];
const pct = (v: number) => `${Math.round(v * 100)} %`;
const elo = (v: number | null) => (v === null ? '–' : v.toLocaleString('fr-FR'));

export function TypeProfile({
  attempts,
  onTrain,
}: {
  attempts: AttemptLike[];
  onTrain: (family: string, sub: string) => void;
}) {
  const [mode, setMode] = useState('storm');
  const [days, setDays] = useState(0);
  const [scope, setScope] = useState<string>('family');
  const [sort, setSort] = useState<'rate' | 'level'>('rate');

  const filtered = useMemo(
    () => filterAttempts(attempts, { mode: mode || undefined, sinceMs: days ? Date.now() - days * 86_400_000 : undefined }),
    [attempts, mode, days],
  );
  const stats = useMemo(() => typeProfile(filtered, scope), [filtered, scope]);
  const enough = (s: TypeStat) => s.attempts >= MIN_ATTEMPTS;

  // Échelle du niveau : bornée par les données, arrondie à 100 Elo.
  const levels = stats.filter((s) => enough(s) && s.maxSolved !== null).map((s) => s.maxSolved!);
  const lo = levels.length ? Math.floor((Math.min(...levels) - 200) / 100) * 100 : 0;
  const hiRaw = levels.length ? Math.max(...levels) : lo + 400;
  // Étendue multiple de 400 : les 4 anneaux tombent sur des centaines rondes.
  const hi = lo + Math.max(400, Math.ceil((hiRaw - lo) / 400) * 400);

  const detail = (s: TypeStat) =>
    s.attempts === 0
      ? 'Aucun puzzle joué'
      : `${s.success}/${s.attempts} réussis${s.attempts < MIN_ATTEMPTS ? ' — trop peu pour conclure' : ''}`;

  const accAxes: RadarAxis[] = stats.map((s) => ({
    id: s.id,
    label: s.label,
    value: enough(s) ? s.rate : null,
    display: s.attempts ? pct(s.rate) : '–',
    detail: detail(s),
  }));
  const lvlAxes: RadarAxis[] = stats.map((s) => ({
    id: s.id,
    label: s.label,
    value: enough(s) && s.maxSolved !== null ? (s.maxSolved - lo) / (hi - lo) : null,
    display: elo(s.maxSolved),
    detail: `${detail(s)}${s.avgFailed !== null ? ` · bute vers ${elo(s.avgFailed)}` : ''}`,
  }));
  const ringsLvl = [0.25, 0.5, 0.75, 1].map((r) => ({ r, label: elo(Math.round(lo + r * (hi - lo))) }));

  const ranking = [...stats]
    .filter((s) => s.attempts > 0)
    .sort((a, b) =>
      sort === 'rate' ? a.rate - b.rate || b.attempts - a.attempts : (a.maxSolved ?? 0) - (b.maxSolved ?? 0) || a.rate - b.rate,
    );

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-stone-800/60 p-4">
      <h2 className="text-lg font-bold text-stone-50">🕸 Profil par type de finale</h2>
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button key={m.id} type="button" className={chip(mode === m.id)} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
        <span className="mx-1 w-px bg-stone-700" />
        {PERIODS.map((p) => (
          <button key={p.id} type="button" className={chip(days === p.id)} onClick={() => setDays(p.id)}>
            {p.label}
          </button>
        ))}
        <span className="mx-1 w-px bg-stone-700" />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="rounded-lg bg-stone-900 px-2 py-1 text-sm text-stone-200"
          aria-label="Détail"
        >
          <option value="family">Par famille</option>
          {FAMILY_ORDER.map((f) => (
            <option key={f} value={f}>
              Sous-thèmes : {FAMILY_LABEL[f as Family]}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-stone-500">
        Précision = puzzles réussis / tentés. Niveau atteint = Elo du puzzle le plus difficile réussi ; « bute vers » = Elo moyen
        des puzzles manqués. Un type joué moins de {MIN_ATTEMPTS} fois n’est pas placé sur le radar.
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-xl bg-stone-800 p-6 text-center text-sm text-stone-400">Aucun puzzle joué pour ce choix.</p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <RadarChart
              title="Précision par type"
              axes={accAxes}
              rings={[0.25, 0.5, 0.75, 1].map((r) => ({ r, label: pct(r) }))}
            />
            <RadarChart title="Niveau atteint par type (Elo)" axes={lvlAxes} rings={ringsLvl} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-stone-400">
                <tr>
                  <th className="py-1 pr-3 font-semibold">#</th>
                  <th className="py-1 pr-3 font-semibold">Type</th>
                  <th className="py-1 pr-3 text-right font-semibold">Tentés</th>
                  <th className="py-1 pr-3 text-right font-semibold">
                    <button type="button" onClick={() => setSort('rate')} className={sort === 'rate' ? 'text-amber-400' : 'hover:text-stone-200'}>
                      Précision {sort === 'rate' && '▲'}
                    </button>
                  </th>
                  <th className="py-1 pr-3 text-right font-semibold">
                    <button type="button" onClick={() => setSort('level')} className={sort === 'level' ? 'text-amber-400' : 'hover:text-stone-200'}>
                      Niveau atteint {sort === 'level' && '▲'}
                    </button>
                  </th>
                  <th className="py-1 pr-3 text-right font-semibold">Bute vers</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="tabular-nums text-stone-200">
                {ranking.map((s, i) => (
                  <tr key={s.id} className="border-t border-stone-700/60" title={s.title}>
                    <td className="py-1 pr-3 text-stone-500">{i + 1}</td>
                    <td className="py-1 pr-3">
                      {s.label}
                      {!enough(s) && <span className="ml-1 text-xs text-stone-500">(peu de données)</span>}
                    </td>
                    <td className="py-1 pr-3 text-right">{s.attempts}</td>
                    <td className="py-1 pr-3 text-right font-semibold">{pct(s.rate)}</td>
                    <td className="py-1 pr-3 text-right">{elo(s.maxSolved)}</td>
                    <td className="py-1 pr-3 text-right text-stone-400">{elo(s.avgFailed)}</td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        onClick={() => onTrain(s.family, scope === 'family' || s.id.endsWith('-autres') ? 'all' : s.id)}
                        className="rounded-md bg-stone-700 px-2 py-0.5 text-xs text-stone-100 hover:bg-amber-600"
                        title={`Storm sur : ${s.title}`}
                      >
                        ▶
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
