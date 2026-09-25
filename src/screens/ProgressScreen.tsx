// Profils joueurs et progression : évolution des scores, réussite par
// sous-thème, points faibles (avec accès direct à l'entraînement ciblé).

import { useMemo, useRef, useState } from 'react';
import { AccountPanel } from '../components/AccountPanel';
import { ScoreDashboard } from '../components/ScoreDashboard';
import { badges, dayStreak } from '../core/motivation';
import { ratingsByKey } from '../core/playerRating';
import type { CloudAccount } from '../hooks/useCloudAccount';
import { TypeProfile } from '../components/TypeProfile';
import { ScoreChart } from '../components/charts/ScoreChart';
import { FAMILY_LABEL } from '../core/material';
import { filterAttempts, scoreSeries, totals } from '../core/stats';
import type { Family } from '../core/types';
import type { PlayerStore } from '../services/playerStore';

interface Props {
  store: PlayerStore;
  account: CloudAccount;
  onPrivacy: () => void;
  playerId: string | null;
  onPlayerChange: (id: string | null) => void;
  onTrain: (family: string, subcategory: string, mode?: 'storm' | 'streak') => void;
  onHome: () => void;
}

const PERIODS = [
  { id: 'all', label: 'Tout', ms: 0 },
  { id: '7', label: '7 jours', ms: 7 * 86_400_000 },
  { id: '30', label: '30 jours', ms: 30 * 86_400_000 },
];
const MODES = [
  { id: '', label: 'Tous modes' },
  { id: 'storm', label: 'Storm' },
  { id: 'streak', label: 'Streak' },
  { id: 'training', label: 'Entraînement' },
];
const FAMILIES: Family[] = ['pions', 'tours', 'dames', 'fous', 'cavaliers', 'mixte'];

const chip = (active: boolean) =>
  `rounded-full px-3 py-1 text-sm font-semibold transition ${active ? 'bg-amber-500 text-stone-900' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'}`;

export function ProgressScreen({ store, account, onPrivacy, playerId, onPlayerChange, onTrain, onHome }: Props) {
  const [version, setVersion] = useState(0); // force la relecture après une modification
  const [newName, setNewName] = useState('');
  const [mode, setMode] = useState('');
  const [family, setFamily] = useState('');
  const [period, setPeriod] = useState('all');
  const [chartMode, setChartMode] = useState<'storm' | 'streak'>('storm');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const players = useMemo(() => store.listPlayers(), [store, version, playerId, account.lastSync]);
  const history = useMemo(
    () => (playerId ? store.history(playerId) : { attempts: [], runs: [] }),
    [store, playerId, version, account.lastSync],
  );
  const since = PERIODS.find((p) => p.id === period)!.ms;
  const filtered = useMemo(
    () => filterAttempts(history.attempts, { mode: mode || undefined, family: family || undefined, sinceMs: since ? Date.now() - since : undefined }),
    [history, mode, family, since],
  );
  const tot = totals(filtered);
  const series = useMemo(
    () => scoreSeries(history.runs.filter((r) => !since || r.t >= Date.now() - since), chartMode),
    [history, chartMode, since],
  );

  const create = () => {
    if (!newName.trim()) return;
    const p = store.createPlayer(newName);
    setNewName('');
    onPlayerChange(p.id);
    setVersion((v) => v + 1);
  };

  const exportData = () => {
    if (!playerId) return;
    const blob = new Blob([store.exportPlayer(playerId)], { type: 'application/json' });
    const a = document.createElement('a');
    const name = players.find((p) => p.id === playerId)?.name ?? 'joueur';
    a.href = URL.createObjectURL(blob);
    a.download = `endgame-rush-${name.replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (file: File) => {
    try {
      const p = store.importPlayer(await file.text());
      onPlayerChange(p.id);
      setVersion((v) => v + 1);
      setMessage(`Sauvegarde de « ${p.name} » importée.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const current = players.find((p) => p.id === playerId) ?? null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-stone-50">📈 Joueurs et progression</h1>
        <button type="button" onClick={onHome} className="text-sm text-stone-400 hover:text-stone-100">
          ← Accueil
        </button>
      </div>

      {/* Profils */}
      <section className="flex flex-col gap-3 rounded-xl bg-stone-800/60 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">Profil joueur</h2>
        <div className="flex flex-wrap gap-2">
          {players.map((p) => (
            <button key={p.id} type="button" className={chip(p.id === playerId)} onClick={() => onPlayerChange(p.id)}>
              👤 {p.name}
            </button>
          ))}
          <button type="button" className={chip(playerId === null)} onClick={() => onPlayerChange(null)}>
            Invité (non archivé)
          </button>
          {players.length > 0 && !current && (
            <span className="self-center text-xs text-stone-500">Cliquez sur un profil pour le sélectionner, l’exporter ou le supprimer.</span>
          )}
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={30}
            placeholder="Nouveau joueur (pseudo)"
            className="min-w-0 flex-1 rounded-lg bg-stone-900 px-3 py-2 text-stone-100 placeholder:text-stone-500"
          />
          <button type="submit" className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-stone-900 hover:bg-amber-400">
            Créer
          </button>
        </form>
        <div className="flex flex-wrap gap-3 text-sm">
          <button type="button" disabled={!playerId} onClick={exportData} className="text-sky-400 hover:underline disabled:opacity-40">
            ⬇ Exporter la sauvegarde
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} className="text-sky-400 hover:underline">
            ⬆ Importer une sauvegarde
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importData(f);
              e.target.value = '';
            }}
          />
          {current &&
            (confirmDelete ? (
              <span className="flex flex-wrap items-center gap-2 text-red-300">
                Supprimer « {current.name} » et tout son historique sur cet appareil ?
                <button
                  type="button"
                  onClick={() => {
                    store.deletePlayer(current.id);
                    setConfirmDelete(false);
                    onPlayerChange(null);
                    setVersion((v) => v + 1);
                    setMessage(`Profil « ${current.name} » supprimé.`);
                  }}
                  className="rounded-md bg-red-600 px-2 py-0.5 font-semibold text-white hover:bg-red-500"
                >
                  Oui, supprimer
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md bg-stone-700 px-2 py-0.5 text-stone-100">
                  Annuler
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="text-red-400 hover:underline">
                🗑 Supprimer ce joueur
              </button>
            ))}
        </div>
        {message && <p className="text-sm text-amber-300">{message}</p>}
        <p className="text-xs text-stone-500">
          Les profils sont enregistrés dans ce navigateur. Connectez-vous à un compte en ligne pour les retrouver sur tous vos
          appareils, ou exportez une sauvegarde.
        </p>
        <AccountPanel account={account} playerId={playerId} playerName={current?.name ?? null} />
        <button type="button" onClick={onPrivacy} className="self-start text-xs text-sky-400 hover:underline">
          🔒 Données personnelles : ce qui est conservé et comment le supprimer
        </button>
      </section>

      {!current ? (
        <p className="text-stone-400">Créez ou choisissez un joueur pour archiver vos parties et suivre vos progrès.</p>
      ) : (
        <>
          {/* Scores façon lichess.org/storm/dashboard : performances isolées, sans cumul */}
          <ScoreDashboard
            runs={history.runs}
            onReplay={(m, themeKey) => {
              const [fam, sub] = themeKey.split('/');
              onTrain(fam, sub ?? 'all', m);
            }}
          />

          {/* Badges */}
          <BadgeGrid history={history} />

          {/* Points faibles par type de finale : radars + classement */}
          <TypeProfile attempts={history.attempts} onTrain={(f, s) => onTrain(f, s)} />

          <h2 className="mt-2 text-sm font-semibold uppercase tracking-wide text-stone-400">Statistiques d’entraînement</h2>
          {/* Filtres : une seule rangée, au-dessus des graphiques */}
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button key={m.id} type="button" className={chip(mode === m.id)} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
            <span className="mx-1 w-px bg-stone-700" />
            <button type="button" className={chip(family === '')} onClick={() => setFamily('')}>
              Tous thèmes
            </button>
            {FAMILIES.map((f) => (
              <button key={f} type="button" className={chip(family === f)} onClick={() => setFamily(f)}>
                {FAMILY_LABEL[f].replace('Finales de ', '').replace('Finales ', '')}
              </button>
            ))}
            <span className="mx-1 w-px bg-stone-700" />
            {PERIODS.map((p) => (
              <button key={p.id} type="button" className={chip(period === p.id)} onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Chiffres clés */}
          <div className="grid grid-cols-3 gap-3">
            <Stat value={String(tot.attempts)} label="Puzzles joués" />
            <Stat value={tot.attempts ? `${Math.round(tot.rate * 100)} %` : '–'} label="Réussite" />
            <Stat value={String(history.runs.length)} label="Parties Rush" />
          </div>

          {/* Évolution */}
          <section className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button type="button" className={chip(chartMode === 'storm')} onClick={() => setChartMode('storm')}>
                Storm
              </button>
              <button type="button" className={chip(chartMode === 'streak')} onClick={() => setChartMode('streak')}>
                Streak
              </button>
            </div>
            <ScoreChart points={series} title={`Évolution du score ${chartMode === 'storm' ? 'Storm' : 'Streak'}`} />
          </section>

        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-stone-800 p-3 text-center">
      <div className="text-3xl font-black text-stone-50 tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-stone-400">{label}</div>
    </div>
  );
}

function BadgeGrid({ history }: { history: { attempts: { t: number; m: string; p: string; r: number; c: string; f: string; ok: boolean }[]; runs: { mode: string; score: number }[] } }) {
  const list = useMemo(
    () => badges(history.attempts, history.runs, dayStreak(history.attempts, Date.now()), ratingsByKey(history.attempts).get('all')),
    [history],
  );
  const earned = list.filter((b) => b.earned).length;
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-stone-800/60 p-4">
      <h2 className="text-lg font-bold text-stone-50">
        🏅 Badges <span className="text-sm font-normal text-stone-400">({earned}/{list.length})</span>
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {list.map((b) => (
          <li
            key={b.id}
            title={b.desc}
            className={`flex flex-col items-center rounded-lg p-2 text-center ${b.earned ? 'bg-amber-500/15 ring-1 ring-amber-500/40' : 'bg-stone-900/60 opacity-60'}`}
          >
            <span className={`text-2xl ${b.earned ? '' : 'grayscale'}`}>{b.icon}</span>
            <span className="text-xs font-semibold text-stone-100">{b.label}</span>
            <span className="text-[11px] text-stone-400">{b.earned ? 'Obtenu' : b.progress}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
