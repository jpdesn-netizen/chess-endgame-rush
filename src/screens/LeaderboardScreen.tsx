// Classement public : Elo, record Storm, puzzles réussis sur 7 jours.

import { useEffect, useState } from 'react';
import { fetchLeaderboard, type Leaderboard, type LeaderboardKind } from '../services/leaderboard';

const TABS: { id: LeaderboardKind; label: string; unit: string; help: string }[] = [
  {
    id: 'elo',
    label: '🎯 Elo',
    unit: 'Elo',
    help: 'Elo finales calculé comme Lichess (1re tentative de chaque puzzle, hors révision et entraînement). Seuls les Elo stabilisés apparaissent.',
  },
  {
    id: 'storm',
    label: '⚡ Storm',
    unit: 'réussis',
    help: 'Meilleur Storm sur le thème « Mix », départ Automatique ou Débutant, pour que tout le monde parte du même point.',
  },
  {
    id: 'week',
    label: '📅 Semaine',
    unit: 'puzzles',
    help: 'Nombre de puzzles différents réussis ces 7 derniers jours, tous modes confondus.',
  },
];

export function LeaderboardScreen({ onHome, onAccount, signedIn }: { onHome: () => void; onAccount: () => void; signedIn: boolean }) {
  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<LeaderboardKind>('elo');

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError('Classement indisponible pour le moment (connexion ou serveur). Réessayez plus tard.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const current = TABS.find((t) => t.id === tab)!;
  const rows = data?.lists[tab] ?? [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-stone-50">🏆 Classement</h1>
        <button type="button" onClick={onHome} className="text-sm text-stone-400 hover:text-stone-100">
          ← Accueil
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Type de classement">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === t.id ? 'bg-amber-500 text-stone-900' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-stone-400">{current.help}</p>

      {error && <p className="rounded-lg bg-red-950/60 p-3 text-sm text-red-200">{error}</p>}
      {!data && !error && <p className="text-stone-400">Chargement…</p>}
      {data && rows.length === 0 && <p className="text-stone-400">Personne pour l’instant : soyez le premier !</p>}
      {data && rows.length > 0 && (
        <ol className="flex flex-col gap-1">
          {rows.map((r) => (
            <li
              key={`${r.rank}-${r.pseudo}`}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 ${r.me ? 'bg-amber-500/20 ring-1 ring-amber-500' : 'bg-stone-800'}`}
            >
              <span className="w-10 text-right font-bold text-stone-400">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `${r.rank}.`}</span>
              <span className="flex-1 truncate font-semibold text-stone-50">
                {r.pseudo}
                {r.me && <span className="ml-2 text-xs text-amber-300">(vous)</span>}
              </span>
              <span className="font-mono text-lg font-bold text-stone-50">{r.value}</span>
              <span className="w-16 text-xs text-stone-400">{current.unit}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs text-stone-500">
        {data?.computedAt && `Mis à jour à ${new Date(data.computedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (toutes les 5 min). `}
        Participation volontaire, sous un pseudo.{' '}
        <button type="button" onClick={onAccount} className="text-sky-400 hover:underline">
          {signedIn ? 'Régler ma participation (📈 → Compte)' : 'Créer un compte pour participer'}
        </button>
      </p>
    </div>
  );
}
