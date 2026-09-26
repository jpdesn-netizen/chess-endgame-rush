// Synchronisation profil local ↔ compte en ligne.
//
//  * Un profil local peut être « lié » à un compte (un seul compte par profil).
//  * Chaque puzzle / partie est d'abord écrit en local (l'appli marche hors
//    ligne), puis placé dans une file d'envoi, vidée dès que possible.
//  * Au premier lien, TOUT l'historique local part dans la file : c'est la
//    reprise de l'historique. Les envois sont idempotents (clés uniques côté
//    base), donc un renvoi après coupure ne crée pas de doublon.
//  * À la connexion sur un autre appareil, l'historique en ligne est
//    rapatrié et fusionné (sans doublon) dans le profil local.

import {
  attemptToRow,
  rowToAttempt,
  rowToRun,
  runToRow,
  type Attempt,
  type AttemptRow,
  type PlayerHistory,
  type Run,
  type RunRow,
} from '../core/history';
import { cloudEnabled, getCloud } from './cloud';
import type { PlayerStore } from './playerStore';

const PREFIX = 'endgameRush:v1:';
const BATCH = 500;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* stockage plein : la file sera reconstruite au prochain lien */
  }
}

// ---------------------------------------------------------------- Liens

type Links = Record<string, string>; // playerId → userId

export const linkedUser = (playerId: string): string | null => read<Links>('cloudLinks', {})[playerId] ?? null;
export const playerOfUser = (userId: string): string | null =>
  Object.entries(read<Links>('cloudLinks', {})).find(([, u]) => u === userId)?.[0] ?? null;

export function linkPlayer(store: PlayerStore, playerId: string, userId: string): void {
  write('cloudLinks', { ...read<Links>('cloudLinks', {}), [playerId]: userId });
  // Reprise de l'historique : tout l'existant part dans la file d'envoi.
  write(`outbox:${playerId}`, store.history(playerId));
}

export function unlinkPlayer(playerId: string): void {
  const links = read<Links>('cloudLinks', {});
  delete links[playerId];
  write('cloudLinks', links);
  write(`outbox:${playerId}`, { attempts: [], runs: [] });
}

// -------------------------------------------------------- File d'envoi

const outbox = (playerId: string) => read<PlayerHistory>(`outbox:${playerId}`, { attempts: [], runs: [] });
export const pendingCount = (playerId: string) => {
  const o = outbox(playerId);
  return o.attempts.length + o.runs.length;
};

function enqueue(playerId: string, entry: { attempt?: Attempt; run?: Run }): void {
  const o = outbox(playerId);
  if (entry.attempt) o.attempts.push(entry.attempt);
  if (entry.run) o.runs.push(entry.run);
  write(`outbox:${playerId}`, o);
}

/** Envoie la file ; renvoie le nombre d'entrées envoyées. Lève une erreur en cas d'échec. */
export async function flush(playerId: string): Promise<number> {
  const userId = linkedUser(playerId);
  if (!cloudEnabled || !userId) return 0;
  const cloud = await getCloud();
  if (!cloud) return 0;
  const { data } = await cloud.auth.getSession();
  if (data.session?.user.id !== userId) return 0; // pas connecté avec le bon compte
  let sent = 0;
  for (;;) {
    const o = outbox(playerId);
    if (o.runs.length) {
      const part = o.runs.slice(0, BATCH);
      const { error } = await cloud
        .from('runs')
        .upsert(part.map((r) => runToRow(r, userId)), { onConflict: 'user_id,t,mode', ignoreDuplicates: true });
      if (error) throw error;
      write(`outbox:${playerId}`, { ...outbox(playerId), runs: outbox(playerId).runs.slice(part.length) });
      sent += part.length;
    } else if (o.attempts.length) {
      const part = o.attempts.slice(0, BATCH);
      const { error } = await cloud
        .from('attempts')
        .upsert(part.map((a) => attemptToRow(a, userId)), { onConflict: 'user_id,t,p', ignoreDuplicates: true });
      if (error) throw error;
      write(`outbox:${playerId}`, { ...outbox(playerId), attempts: outbox(playerId).attempts.slice(part.length) });
      sent += part.length;
    } else return sent;
  }
}

/** Rapatrie l'historique en ligne et le fusionne dans le profil local. */
export async function pull(store: PlayerStore, playerId: string): Promise<number> {
  if (!cloudEnabled || !linkedUser(playerId)) return 0;
  const cloud = await getCloud();
  if (!cloud) return 0;
  const page = 1000;
  const fetchAll = async <T,>(table: 'attempts' | 'runs'): Promise<T[]> => {
    const rows: T[] = [];
    for (let from = 0; ; from += page) {
      const { data, error } = await cloud.from(table).select('*').order('id').range(from, from + page - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < page) return rows;
    }
  };
  const [a, r] = await Promise.all([fetchAll<AttemptRow>('attempts'), fetchAll<RunRow>('runs')]);
  return store.mergeHistory(playerId, { attempts: a.map(rowToAttempt), runs: r.map(rowToRun) });
}

// ---------------------------------------- Magasin local + envoi automatique

/**
 * Enveloppe le magasin local : chaque ajout est aussi mis en file d'envoi si
 * le profil est lié, puis envoyé quelques secondes plus tard (regroupement).
 */
export function withCloudSync(local: PlayerStore, onError?: (e: unknown) => void): PlayerStore {
  const timers = new Map<string, number>();
  const schedule = (playerId: string) => {
    if (!cloudEnabled || !linkedUser(playerId)) return;
    window.clearTimeout(timers.get(playerId));
    timers.set(
      playerId,
      window.setTimeout(() => flush(playerId).catch((e) => onError?.(e)), 3_000),
    );
  };
  return {
    ...local,
    addAttempt(id, attempt) {
      local.addAttempt(id, attempt);
      if (linkedUser(id)) enqueue(id, { attempt });
      schedule(id);
    },
    addRun(id, run) {
      local.addRun(id, run);
      if (linkedUser(id)) enqueue(id, { run });
      schedule(id);
    },
    deletePlayer(id) {
      unlinkPlayer(id); // les données en ligne restent sur le compte
      local.deletePlayer(id);
    },
  };
}
