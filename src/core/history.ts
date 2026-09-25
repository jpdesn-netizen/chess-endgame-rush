// Historique joueur : validation des données importées, fusion sans doublon,
// conversion vers / depuis les lignes de la base en ligne. Fonctions pures.

export interface Attempt {
  t: number; // horodatage (ms)
  m: 'storm' | 'streak' | 'training' | 'review' | 'daily';
  p: string; // identifiant du puzzle
  r: number; // Elo du puzzle
  c: string; // sous-catégorie
  f: string; // famille
  ok: boolean;
}

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

// ------------------------------------------------------------ Validation
// Mêmes bornes que les contraintes SQL (supabase/migrations/0001_comptes.sql) :
// une donnée refusée ici le serait aussi par la base.

const T_MIN = 1_700_000_000_000;
const T_MAX = 4_102_444_800_000;
const int = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const str = (v: unknown, max: number, re?: RegExp): v is string =>
  typeof v === 'string' && v.length >= 1 && v.length <= max && (!re || re.test(v));
const ID = /^[\w./-]+$/;
const optInt = (v: unknown, min: number, max: number) => v === undefined || v === null || int(v, min, max);

export function isAttempt(a: unknown): a is Attempt {
  const x = a as Record<string, unknown>;
  return (
    !!x &&
    typeof x === 'object' &&
    int(x.t, T_MIN, T_MAX) &&
    (x.m === 'storm' || x.m === 'streak' || x.m === 'training' || x.m === 'review' || x.m === 'daily') &&
    str(x.p, 40, ID) &&
    int(x.r, 0, 4000) &&
    str(x.c, 40, ID) &&
    str(x.f, 20, ID) &&
    typeof x.ok === 'boolean'
  );
}

export function isRun(r: unknown): r is Run {
  const x = r as Record<string, unknown>;
  return (
    !!x &&
    typeof x === 'object' &&
    int(x.t, T_MIN, T_MAX) &&
    (x.mode === 'storm' || x.mode === 'streak') &&
    str(x.theme, 60, ID) &&
    int(x.level, 0, 4000) &&
    int(x.score, 0, 1000) &&
    int(x.errors, 0, 1000) &&
    int(x.bestCombo, 0, 1000) &&
    optInt(x.highest, 0, 4000) &&
    optInt(x.played, 0, 2000) &&
    optInt(x.moves, 0, 10000) &&
    optInt(x.durationMs, 0, 86_400_000)
  );
}

/** Ne garde que des champs connus et valides (données importées ou reçues). */
export function sanitizeHistory(h: unknown): { history: PlayerHistory; rejected: number } {
  const x = (h ?? {}) as { attempts?: unknown; runs?: unknown };
  const rawA = Array.isArray(x.attempts) ? x.attempts : [];
  const rawR = Array.isArray(x.runs) ? x.runs : [];
  const attempts = rawA.filter(isAttempt).map(({ t, m, p, r, c, f, ok }) => ({ t, m, p, r, c, f, ok }));
  const runs = rawR.filter(isRun).map((r) => pickRun(r));
  return { history: { attempts, runs }, rejected: rawA.length - attempts.length + rawR.length - runs.length };
}

function pickRun(r: Run): Run {
  const out: Run = { t: r.t, mode: r.mode, theme: r.theme, level: r.level, score: r.score, errors: r.errors, bestCombo: r.bestCombo };
  if (r.highest != null) out.highest = r.highest;
  if (r.played != null) out.played = r.played;
  if (r.moves != null) out.moves = r.moves;
  if (r.durationMs != null) out.durationMs = r.durationMs;
  return out;
}

// ----------------------------------------------------------------- Fusion

export const attemptKey = (a: Attempt) => `${a.t}|${a.p}`;
export const runKey = (r: Run) => `${r.t}|${r.mode}`;

/** Ajoute à `base` les entrées de `extra` absentes (mêmes clés que la base en ligne). */
export function mergeHistories(base: PlayerHistory, extra: PlayerHistory): { history: PlayerHistory; added: number } {
  const ka = new Set(base.attempts.map(attemptKey));
  const kr = new Set(base.runs.map(runKey));
  const newA = extra.attempts.filter((a) => !ka.has(attemptKey(a)) && ka.add(attemptKey(a)));
  const newR = extra.runs.filter((r) => !kr.has(runKey(r)) && kr.add(runKey(r)));
  return {
    history: {
      attempts: [...base.attempts, ...newA].sort((a, b) => a.t - b.t),
      runs: [...base.runs, ...newR].sort((a, b) => a.t - b.t),
    },
    added: newA.length + newR.length,
  };
}

// ------------------------------------------------ Lignes de la base en ligne

export interface RunRow {
  user_id?: string;
  t: number;
  mode: Run['mode'];
  theme: string;
  level: number;
  score: number;
  errors: number;
  best_combo: number;
  highest: number | null;
  played: number | null;
  moves: number | null;
  duration_ms: number | null;
}

export type AttemptRow = Attempt & { user_id?: string };

export const attemptToRow = (a: Attempt, userId: string): AttemptRow => ({ user_id: userId, t: a.t, m: a.m, p: a.p, r: a.r, c: a.c, f: a.f, ok: a.ok });

export const runToRow = (r: Run, userId: string): RunRow => ({
  user_id: userId,
  t: r.t,
  mode: r.mode,
  theme: r.theme,
  level: r.level,
  score: r.score,
  errors: r.errors,
  best_combo: r.bestCombo,
  highest: r.highest ?? null,
  played: r.played ?? null,
  moves: r.moves ?? null,
  duration_ms: r.durationMs ?? null,
});

export const rowToRun = (x: RunRow): Run =>
  pickRun({
    t: Number(x.t),
    mode: x.mode,
    theme: x.theme,
    level: x.level,
    score: x.score,
    errors: x.errors,
    bestCombo: x.best_combo,
    highest: x.highest ?? undefined,
    played: x.played ?? undefined,
    moves: x.moves ?? undefined,
    durationMs: x.duration_ms ?? undefined,
  });

export const rowToAttempt = (x: AttemptRow): Attempt => ({ t: Number(x.t), m: x.m, p: x.p, r: x.r, c: x.c, f: x.f, ok: x.ok });
