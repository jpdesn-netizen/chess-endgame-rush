// Règles des modes Rush, sous forme de reducers purs (temps passé en paramètre,
// jamais lu à l'intérieur → testables sans horloge).
//  - Storm  : chrono ; +bonus par réussite, −pénalité par erreur ; fin à 0.
//  - Streak : pas de chrono ; fin à la première erreur ; difficulté croissante.

import { CONFIG } from '../config';

export type RushMode = 'storm' | 'streak';

export interface RushEntry {
  puzzleId: string;
  rating: number;
  success: boolean;
  gameUrl?: string;
  title: string;
}

export interface RushState {
  mode: RushMode;
  /** 'waiting' : partie prête, le chrono démarre au premier coup du joueur. */
  status: 'waiting' | 'running' | 'over';
  startRating: number;
  score: number;
  errors: number;
  combo: number;
  bestCombo: number;
  /** Storm uniquement : instant de fin (ms, horloge du navigateur). */
  endsAt: number | null;
  history: RushEntry[];
}

export type RushEvent =
  | { type: 'START'; now: number }
  | { type: 'SOLVED'; now: number; entry: RushEntry }
  | { type: 'FAILED'; now: number; entry: RushEntry }
  | { type: 'TICK'; now: number };

/** Partie prête ; le chrono ne tourne qu'après l'événement START. */
export function startRush(mode: RushMode, startRating: number): RushState {
  return {
    mode,
    status: 'waiting',
    startRating,
    score: 0,
    errors: 0,
    combo: 0,
    bestCombo: 0,
    endsAt: null,
    history: [],
  };
}

/** Elo visé pour le prochain puzzle : monte à chaque réussite. */
export function targetRating(state: RushState): number {
  const step = state.mode === 'storm' ? CONFIG.modes.storm.eloStep : CONFIG.modes.streak.eloStep;
  return state.startRating + state.score * step;
}

export function remainingMs(state: RushState, now: number): number | null {
  if (state.mode !== 'storm') return null;
  if (state.endsAt === null) return CONFIG.modes.storm.durationMs; // pas encore démarré
  return Math.max(0, state.endsAt - now);
}

export function rushReducer(state: RushState, event: RushEvent): RushState {
  if (state.status === 'over') return state;
  if (event.type === 'START') {
    if (state.status !== 'waiting') return state;
    return {
      ...state,
      status: 'running',
      endsAt: state.mode === 'storm' ? event.now + CONFIG.modes.storm.durationMs : null,
    };
  }
  if (state.status === 'waiting') {
    if (event.type === 'TICK') return state; // le chrono n'a pas démarré
    state = rushReducer(state, { type: 'START', now: event.now });
  }
  const timeUp = state.endsAt !== null && event.now >= state.endsAt;
  if (timeUp) return { ...state, status: 'over' };

  switch (event.type) {
    case 'TICK':
      return state;

    case 'SOLVED': {
      const combo = state.combo + 1;
      return {
        ...state,
        score: state.score + 1,
        combo,
        bestCombo: Math.max(state.bestCombo, combo),
        endsAt: state.endsAt === null ? null : state.endsAt + CONFIG.modes.storm.bonusMs,
        history: [...state.history, event.entry],
      };
    }

    case 'FAILED': {
      const next: RushState = { ...state, errors: state.errors + 1, combo: 0, history: [...state.history, event.entry] };
      if (state.mode === 'streak') return { ...next, status: 'over' };
      const endsAt = (state.endsAt ?? event.now) - CONFIG.modes.storm.penaltyMs;
      return { ...next, endsAt, status: endsAt <= event.now ? 'over' : 'running' };
    }
  }
}
