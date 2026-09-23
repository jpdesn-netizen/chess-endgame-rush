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
  status: 'running' | 'over';
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
  | { type: 'SOLVED'; now: number; entry: RushEntry }
  | { type: 'FAILED'; now: number; entry: RushEntry }
  | { type: 'TICK'; now: number };

export function startRush(mode: RushMode, startRating: number, now: number): RushState {
  return {
    mode,
    status: 'running',
    startRating,
    score: 0,
    errors: 0,
    combo: 0,
    bestCombo: 0,
    endsAt: mode === 'storm' ? now + CONFIG.modes.storm.durationMs : null,
    history: [],
  };
}

/** Elo visé pour le prochain puzzle : monte à chaque réussite. */
export function targetRating(state: RushState): number {
  const step = state.mode === 'storm' ? CONFIG.modes.storm.eloStep : CONFIG.modes.streak.eloStep;
  return state.startRating + state.score * step;
}

export function remainingMs(state: RushState, now: number): number | null {
  return state.endsAt === null ? null : Math.max(0, state.endsAt - now);
}

export function rushReducer(state: RushState, event: RushEvent): RushState {
  if (state.status === 'over') return state;
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
