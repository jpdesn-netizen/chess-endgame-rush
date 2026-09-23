// Records stockés dans le navigateur (localStorage), sans inscription.
// Accès protégés : en navigation privée, le stockage peut être indisponible.

const KEY = 'endgameRush:v1:scores';

export interface BestScore {
  score: number;
  date: string;
}

type Store = Record<string, BestScore>;

export function scoreKey(mode: string, family: string, startRating: number): string {
  return `${mode}|${family}|${startRating}`;
}

function read(): Store {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

export function getBest(key: string): BestScore | null {
  return read()[key] ?? null;
}

/** Enregistre le score s'il bat le record. Renvoie l'ancien record. */
export function submitScore(key: string, score: number): { isRecord: boolean; previous: BestScore | null } {
  const store = read();
  const previous = store[key] ?? null;
  const isRecord = score > 0 && (!previous || score > previous.score);
  if (isRecord) {
    store[key] = { score, date: new Date().toISOString().slice(0, 10) };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* stockage indisponible : le record ne sera pas conservé */
    }
  }
  return { isRecord, previous };
}
