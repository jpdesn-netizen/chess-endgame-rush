// Tableau de bord des scores, inspiré de lichess.org/storm/dashboard :
// records (depuis le début, mois, semaine, jour), bouton Rejouer, puis le
// meilleur essai de chaque jour. En plus de Lichess : filtre par type de
// finale et vue « toutes les sessions ». Chaque partie est isolée, sans cumul.

import { useMemo, useState, type ReactNode } from 'react';
import { categoryInfo, dailyBest, periodRecords, recentRuns, runAccuracy } from '../core/stats';
import { THEMES } from '../screens/HomeScreen';
import type { Run } from '../services/playerStore';

const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-sm font-semibold transition ${active ? 'bg-amber-500 text-stone-900' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'}`;

const fmtDay = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtAcc = (r: Run) => {
  const a = runAccuracy(r);
  return a === null ? '–' : `${(a * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
};
const fmtTime = (r: Run) => (r.durationMs === undefined ? '–' : `${Math.round(r.durationMs / 1000)} s`);
const dash = (v: number | undefined) => (v === undefined ? '–' : v.toLocaleString('fr-FR'));

export function themeLabel(themeKey: string): string {
  const [family, sub] = themeKey.split('/');
  const fam = THEMES.find((t) => t.id === family)?.label ?? family;
  return sub ? `${fam} · ${categoryInfo(sub, family).label}` : fam;
}

const MODE_INFO = {
  storm: { label: 'Puzzle Storm', unit: 'puzzles réussis en 3 min' },
  streak: { label: 'Puzzle Streak', unit: 'puzzles réussis d’affilée' },
} as const;

type Mode = keyof typeof MODE_INFO;

export function ScoreDashboard({ runs, onReplay }: { runs: Run[]; onReplay: (mode: Mode, themeKey: string) => void }) {
  const [mode, setMode] = useState<Mode>('storm');
  const [theme, setTheme] = useState('');
  const [view, setView] = useState<'daily' | 'sessions'>('daily');
  const [showAll, setShowAll] = useState(false);
  const now = Date.now();

  const themes = useMemo(() => [...new Set(runs.filter((r) => r.mode === mode).map((r) => r.theme))].sort(), [runs, mode]);
  const rec = useMemo(() => periodRecords(runs, mode, now, theme || undefined), [runs, mode, theme, now]);
  const days = useMemo(() => dailyBest(runs, mode, theme || undefined), [runs, mode, theme]);
  const sessions = useMemo(() => recentRuns(runs, mode, Infinity, theme || undefined), [runs, mode, theme]);
  const LIMIT = 15;
  const rows = view === 'daily' ? days.length : sessions.length;
  const storm = mode === 'storm';
  const replayTheme = theme || sessions[0]?.theme || 'mix';

  const tiles: { label: string; run: Run | null; hero?: boolean }[] = [
    { label: 'Depuis le début', run: rec.all, hero: true },
    { label: 'Ce mois-ci', run: rec.month },
    { label: 'Cette semaine', run: rec.week },
    { label: 'Aujourd’hui', run: rec.today },
  ];

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-stone-800/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={chip(mode === m)}
            onClick={() => {
              setMode(m);
              setTheme('');
            }}
          >
            {MODE_INFO[m].label}
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-stone-700" />
        <label className="flex items-center gap-2 text-sm text-stone-400">
          Type de finale
          <select value={theme} onChange={(e) => setTheme(e.target.value)} className="rounded-lg bg-stone-900 px-2 py-1 text-stone-200">
            <option value="">Tous</option>
            {themes.map((t) => (
              <option key={t} value={t}>
                {themeLabel(t)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2 className="text-2xl font-light text-stone-50">
        {MODE_INFO[mode].label} · Meilleurs scores
        {theme && <span className="ml-2 text-base text-stone-400">({themeLabel(theme)})</span>}
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ label, run, hero }) => (
          <div
            key={label}
            className={`flex flex-col items-center justify-center rounded-xl p-4 text-center ${
              hero ? 'bg-gradient-to-b from-amber-500 to-amber-600 text-white' : 'bg-stone-800 ring-1 ring-stone-700'
            }`}
            title={run ? `${fmtDay(run.t)} · ${themeLabel(run.theme)}` : undefined}
          >
            <div className={`font-mono font-black tabular-nums ${hero ? 'text-6xl' : 'text-5xl text-stone-50'}`}>{run ? run.score : 0}</div>
            <div className={`mt-1 text-sm ${hero ? 'text-amber-50' : 'text-stone-400'}`}>{label}</div>
          </div>
        ))}
      </div>
      <p className="-mt-2 text-xs text-stone-500">Score = {MODE_INFO[mode].unit}.</p>

      <button
        type="button"
        onClick={() => onReplay(mode, replayTheme)}
        className="rounded-xl bg-sky-600 py-5 text-xl font-bold tracking-[0.5em] text-white transition hover:bg-sky-500"
        title={`Rejouer : ${themeLabel(replayTheme)}`}
      >
        🌪 REJOUER
      </button>

      <div className="flex gap-2">
        <button type="button" className={chip(view === 'daily')} onClick={() => setView('daily')}>
          Meilleur essai du jour
        </button>
        <button type="button" className={chip(view === 'sessions')} onClick={() => setView('sessions')}>
          Toutes les sessions
        </button>
      </div>

      {rows === 0 ? (
        <p className="text-sm text-stone-400">Aucune partie enregistrée pour ce choix.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-stone-400">
              <tr>
                <Th>{view === 'daily' ? 'Meilleur essai du jour' : 'Date'}</Th>
                <Th right>Score</Th>
                {view === 'sessions' && <Th>Type</Th>}
                <Th right>Coups</Th>
                <Th right>Précision</Th>
                {storm && <Th right>Combo</Th>}
                {storm && <Th right>Temps</Th>}
                <Th right>+ difficile réussi</Th>
                {view === 'daily' ? <Th right>Essais</Th> : <Th right>Départ</Th>}
              </tr>
            </thead>
            <tbody className="tabular-nums text-stone-200">
              {view === 'daily'
                ? days.slice(0, showAll ? undefined : LIMIT).map(({ day, best, count }, i) => (
                    <tr key={day} className={i % 2 ? 'bg-stone-800/50' : ''}>
                      <Td muted>{fmtDay(day)}</Td>
                      <Td right score>
                        {best === rec.all && <span title="Record absolu">🏆 </span>}
                        {best.score}
                      </Td>
                      <Td right>{dash(best.moves)}</Td>
                      <Td right>{fmtAcc(best)}</Td>
                      {storm && <Td right>{best.bestCombo}</Td>}
                      {storm && <Td right>{fmtTime(best)}</Td>}
                      <Td right>{dash(best.highest)}</Td>
                      <Td right>{count}</Td>
                    </tr>
                  ))
                : sessions.slice(0, showAll ? undefined : LIMIT).map((r, i) => (
                    <tr key={r.t} className={i % 2 ? 'bg-stone-800/50' : ''}>
                      <Td muted>{fmtDateTime(r.t)}</Td>
                      <Td right score>
                        {r === rec.all && <span title="Record absolu">🏆 </span>}
                        {r.score}
                      </Td>
                      <Td>{themeLabel(r.theme)}</Td>
                      <Td right>{dash(r.moves)}</Td>
                      <Td right>{fmtAcc(r)}</Td>
                      {storm && <Td right>{r.bestCombo}</Td>}
                      {storm && <Td right>{fmtTime(r)}</Td>}
                      <Td right>{dash(r.highest)}</Td>
                      <Td right>{r.level}</Td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {rows > LIMIT && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-sm text-sky-400 hover:underline">
              {showAll ? `Afficher les ${LIMIT} premières lignes` : `Afficher les ${rows} lignes`}
            </button>
          )}
          <p className="mt-2 text-xs text-stone-500">
            Précision = coups justes / coups joués. Coups, précision, temps et « + difficile réussi » sont mesurés sur les parties
            jouées depuis cette version (« – » avant).
          </p>
        </div>
      )}
    </section>
  );
}

function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return <th className={`px-2 py-2 font-semibold ${right ? 'text-right' : ''}`}>{children}</th>;
}

function Td({ children, right, muted, score }: { children: ReactNode; right?: boolean; muted?: boolean; score?: boolean }) {
  return (
    <td
      className={`px-2 py-2 ${right ? 'text-right' : ''} ${muted ? 'text-stone-400' : ''} ${score ? 'font-mono text-lg font-bold text-amber-400' : ''}`}
    >
      {children}
    </td>
  );
}
