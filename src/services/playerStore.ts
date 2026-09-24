// Profils joueurs et historique, étape 1 : stockage LOCAL (navigateur).
// L'interface PlayerStore est volontairement indépendante du stockage :
// l'étape 2 (comptes en ligne) fournira une autre implémentation, et
// l'historique local pourra y être importé (exportPlayer / importPlayer).

export interface Player {
  id: string;
  name: string;
  createdAt: string; // ISO
}

/** Un puzzle tenté (format compact : l'historique peut devenir long). */
export interface Attempt {
  t: number; // horodatage (ms)
  m: 'storm' | 'streak' | 'training';
  p: string; // identifiant du puzzle
  r: number; // Elo du puzzle
  c: string; // sous-catégorie (ex. « rp-r », « tours-autres »)
  f: string; // famille
  ok: boolean;
}

/** Une partie Storm / Streak terminée. */
export interface Run {
  t: number;
  mode: 'storm' | 'streak';
  theme: string;
  level: number;
  score: number;
  errors: number;
  bestCombo: number;
  /** Elo du puzzle le plus difficile réussi (absent sur les parties antérieures à la v0.4). */
  highest?: number;
  /** Nombre de puzzles joués dans la partie (idem). */
  played?: number;
  /** Coups joués par le joueur (idem) : sert à la précision façon Lichess. */
  moves?: number;
  /** Durée réelle, du 1er coup à la fin (ms). */
  durationMs?: number;
}

export interface PlayerHistory {
  attempts: Attempt[];
  runs: Run[];
}

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
  /** Restaure une sauvegarde ; renvoie le joueur importé. */
  importPlayer(json: string): Player;
}

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
      const data = JSON.parse(json) as { format?: string; player?: Player; history?: PlayerHistory };
      if (data.format !== 'chess-endgame-rush/player@1' || !data.player || !data.history) {
        throw new Error('Fichier de sauvegarde non reconnu.');
      }
      const existing = players().find((p) => p.id === data.player!.id);
      const player = existing ?? { ...data.player, name: cleanName(data.player.name) };
      if (!existing) write('players', [...players(), player]);
      write(`history:${player.id}`, {
        attempts: (data.history.attempts ?? []).slice(-MAX_ATTEMPTS),
        runs: data.history.runs ?? [],
      });
      return player;
    },
  };
  return store;
}

export const playerStore = createLocalPlayerStore();
