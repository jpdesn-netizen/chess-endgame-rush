// Classement public (calculé par le serveur, voir supabase/migrations/0004_classement.sql).

import { getCloud } from './cloud';

export type LeaderboardKind = 'elo' | 'storm' | 'week';

export interface LeaderboardRow {
  rank: number;
  pseudo: string;
  value: number;
  games: number;
  /** Ligne du joueur connecté. */
  me: boolean;
}

export interface Leaderboard {
  computedAt: string;
  lists: Partial<Record<LeaderboardKind, LeaderboardRow[]>>;
}

function isRow(x: unknown): x is LeaderboardRow {
  const r = x as LeaderboardRow;
  return !!r && typeof r.rank === 'number' && typeof r.pseudo === 'string' && typeof r.value === 'number';
}

export async function fetchLeaderboard(): Promise<Leaderboard> {
  const cloud = await getCloud();
  if (!cloud) throw new Error('Comptes en ligne non configurés.');
  const { data, error } = await cloud.rpc('leaderboard');
  if (error) throw error;
  const d = (data ?? {}) as { computed_at?: string; lists?: Record<string, unknown> };
  const lists: Leaderboard['lists'] = {};
  for (const k of ['elo', 'storm', 'week'] as const) {
    const rows = d.lists?.[k];
    lists[k] = Array.isArray(rows) ? rows.filter(isRow).map((r) => ({ ...r, games: r.games ?? 0, me: !!r.me })) : [];
  }
  return { computedAt: d.computed_at ?? '', lists };
}
