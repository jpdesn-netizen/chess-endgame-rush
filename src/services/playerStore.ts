// Profils joueurs et historique, étape 1 : stockage LOCAL (navigateur).
// L'interface PlayerStore est volontairement indépendante du stockage :
// l'étape 2 (comptes en ligne) fournira une autre implémentation, et
// l'historique local pourra y être importé (exportPlayer / importPlayer).

export interface Player {
  id: string;
  name: string;
  createdAt: string; // ISO
}

import { mergeHistories, sanitizeHistory, type Attempt, type PlayerHistory, type Run } from '../core/history';

export type { Attempt, PlayerHistory, Run };

export interface PlayerStore {
  listPlayers(): Player[];
  createPlayer(name: string): Player;
  renamePlayer(id: string, name: string): void;
  deletePlayer(id: string): void;
  currentPlayerId(): string | null;
  setCurrentPlayer(id: string | null): void;
  history(id: string): PlayerHistory;
  addAttempt(id: string, attempt: Attempt): void;
  addRun(id: string, run: Run): void;
  /** Sauvegarde complète d'un joueur (fichier JSON). */
  exportPlayer(id: string): string;
  /** Restaure une sauvegarde ; renvoie le joueur importé et le nombre d'entrées écartées. */
  importPlayer(json: string): Player;
  /** Ajoute des entrées venues d'ailleurs (compte en ligne), sans doublon. */
  mergeHistory(id: string, extra: PlayerHistory): number;
}

/** Taille maximale d'une sauvegarde importée (protège le navigateur). */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

const PREFIX = 'endgameRush:v1:';
const MAX_ATTEMPTS = 20_000; // au-delà, les plus anciens sont effacés (limite du navigateur)

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
    /* stockage plein ou indisponible : l'historique n'est pas conservé */
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* sans conséquence */
  }
}

const newId = () => `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const cleanName = (name: string) => name.trim().slice(0, 30) || 'Joueur';

export function createLocalPlayerStore(): PlayerStore {
  const players = () => read<Player[]>('players', []);

  const store: PlayerStore = {
    listPlayers: players,

    createPlayer(name) {
      const player: Player = { id: newId(), name: cleanName(name), createdAt: new Date().toISOString() };
      write('players', [...players(), player]);
      write(`history:${player.id}`, { attempts: [], runs: [] });
      return player;
    },

    renamePlayer(id, name) {
      write(
        'players',
        players().map((p) => (p.id === id ? { ...p, name: cleanName(name) } : p)),
      );
    },

    deletePlayer(id) {
      write(
        'players',
        players().filter((p) => p.id !== id),
      );
      remove(`history:${id}`);
      if (store.currentPlayerId() === id) store.setCurrentPlayer(null);
    },

    currentPlayerId() {
      const id = read<string | null>('current', null);
      return id && players().some((p) => p.id === id) ? id : null;
    },

    setCurrentPlayer(id) {
      write('current', id);
    },

    history(id) {
      return read<PlayerHistory>(`history:${id}`, { attempts: [], runs: [] });
    },

    addAttempt(id, attempt) {
      const h = store.history(id);
      const attempts = [...h.attempts, attempt];
      write(`history:${id}`, { ...h, attempts: attempts.slice(-MAX_ATTEMPTS) });
    },

    addRun(id, run) {
      const h = store.history(id);
      write(`history:${id}`, { ...h, runs: [...h.runs, run] });
    },

    exportPlayer(id) {
      const player = players().find((p) => p.id === id);
      return JSON.stringify({ format: 'chess-endgame-rush/player@1', player, history: store.history(id) }, null, 1);
    },

    importPlayer(json) {
      if (json.length > MAX_IMPORT_BYTES) throw new Error('Fichier trop volumineux.');
      let data: { format?: unknown; player?: { id?: unknown; name?: unknown; createdAt?: unknown }; history?: unknown };
      try {
        data = JSON.parse(json);
      } catch {
        throw new Error('Fichier de sauvegarde illisible.');
      }
      const src = data?.player;
      if (
        data?.format !== 'chess-endgame-rush/player@1' ||
        !src ||
        typeof src.id !== 'string' ||
        !/^p_[a-z0-9_]{4,40}$/.test(src.id) ||
        typeof src.name !== 'string'
      ) {
        throw new Error('Fichier de sauvegarde non reconnu.');
      }
      // Seules les entrées valides sont gardées (types et bornes contrôlés).
      const { history } = sanitizeHistory(data.history);
      const existing = players().find((p) => p.id === src.id);
      const player: Player = existing ?? {
        id: src.id,
        name: cleanName(src.name),
        createdAt: typeof src.createdAt === 'string' && !Number.isNaN(Date.parse(src.createdAt)) ? src.createdAt : new Date().toISOString(),
      };
      if (!existing) write('players', [...players(), player]);
      write(`history:${player.id}`, {
        attempts: history.attempts.slice(-MAX_ATTEMPTS),
        runs: history.runs,
      });
      return player;
    },

    mergeHistory(id, extra) {
      const { history, added } = mergeHistories(store.history(id), sanitizeHistory(extra).history);
      if (added > 0) write(`history:${id}`, { ...history, attempts: history.attempts.slice(-MAX_ATTEMPTS) });
      return added;
    },
  };
  return store;
}

export const localPlayerStore = createLocalPlayerStore();
