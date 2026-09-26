// Déroulement d'UN puzzle, sous forme de reducer pur :
// (état, événement) → nouvel état. Les appels réseau et les délais sont
// gérés à l'extérieur (hook usePuzzlePlayer) ; ici, uniquement les règles.

import type { AppliedMove } from '../chessRules';
import type { ModeRules } from '../config';
import { positionKey, sideToMove } from '../fen';
import type { Verdict } from '../judge/tablebaseJudge';
import type { Color, Puzzle } from '../types';

export type Phase =
  | 'awaitingPlayer' // au joueur de jouer
  | 'judging' // coup joué, verdict en attente
  | 'opponentThinking' // bon coup, réponse adverse en attente
  | 'solved'
  | 'failed'
  | 'error';

export type EndReason =
  | 'checkmate' // le joueur a maté
  | 'held-draw' // nulle tenue le nombre de coups requis
  | 'draw-reached' // pat / matériel insuffisant / répétition avec objectif nulle
  | 'still-winning' // limite de coups atteinte, gain conservé
  | 'bad-move' // verdict négatif
  | 'drawn-instead' // la partie devient nulle alors qu'il fallait gagner
  | 'too-long'; // limite de sécurité dépassée

export interface PlayedMove {
  san: string;
  uci: string;
  by: 'player' | 'opponent';
}

export interface SessionState {
  puzzle: Puzzle;
  rules: ModeRules;
  playerColor: Color;
  fen: string;
  /** Clés de position déjà rencontrées (détection de la triple répétition). */
  seen: string[];
  moves: PlayedMove[];
  playerMoveCount: number;
  lastMove: { from: string; to: string } | null;
  /** Dernier coup du joueur (pour savoir s'il mate ou annule sur l'échiquier). */
  lastPlayerMove: AppliedMove | null;
  phase: Phase;
  verdict: Verdict | null;
  endReason: EndReason | null;
  error: string | null;
  /** Nombre de mauvais coups repris (entraînement). */
  takebacks: number;
}

export type SessionEvent =
  | { type: 'PLAYER_MOVED'; move: AppliedMove }
  | { type: 'VERDICT'; verdict: Verdict }
  | { type: 'OPPONENT_MOVED'; move: AppliedMove }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' }
  /** Entraînement : annuler le mauvais coup et rejouer depuis la position d'avant. */
  | { type: 'TAKEBACK' };

export function initialSession(puzzle: Puzzle, rules: ModeRules): SessionState {
  return {
    puzzle,
    rules,
    playerColor: sideToMove(puzzle.fen),
    fen: puzzle.fen,
    seen: [positionKey(puzzle.fen)],
    moves: [],
    playerMoveCount: 0,
    lastMove: puzzle.lastMove ? { from: puzzle.lastMove.slice(0, 2), to: puzzle.lastMove.slice(2, 4) } : null,
    lastPlayerMove: null,
    phase: 'awaitingPlayer',
    verdict: null,
    endReason: null,
    error: null,
    takebacks: 0,
  };
}

function isThreefold(seen: string[], fen: string): boolean {
  const key = positionKey(fen);
  return seen.filter((k) => k === key).length >= 3;
}

/** La partie est-elle terminée par une nulle « sur l'échiquier » ? */
function drawnOnBoard(move: AppliedMove, seen: string[]): boolean {
  return move.isStalemate || move.isInsufficientMaterial || isThreefold(seen, move.fen);
}

function finish(state: SessionState, success: boolean, endReason: EndReason): SessionState {
  return { ...state, phase: success ? 'solved' : 'failed', endReason };
}

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'RESET':
      return initialSession(state.puzzle, state.rules);

    case 'ERROR':
      return { ...state, phase: 'error', error: event.message };

    case 'TAKEBACK': {
      const bad = state.lastPlayerMove;
      if (state.phase !== 'failed' || state.endReason !== 'bad-move' || !bad) return state;
      const moves = state.moves.slice(0, -1);
      const prev = moves.at(-1);
      const lastMove = prev
        ? { from: prev.uci.slice(0, 2), to: prev.uci.slice(2, 4) }
        : initialSession(state.puzzle, state.rules).lastMove;
      return {
        ...state,
        fen: bad.fenBefore,
        seen: state.seen.slice(0, -1),
        moves,
        playerMoveCount: state.playerMoveCount - 1,
        lastMove,
        lastPlayerMove: null,
        phase: 'awaitingPlayer',
        verdict: null,
        endReason: null,
        takebacks: state.takebacks + 1,
      };
    }

    case 'PLAYER_MOVED': {
      if (state.phase !== 'awaitingPlayer') return state;
      const m = event.move;
      return {
        ...state,
        fen: m.fen,
        seen: [...state.seen, positionKey(m.fen)],
        moves: [...state.moves, { san: m.san, uci: m.uci, by: 'player' }],
        playerMoveCount: state.playerMoveCount + 1,
        lastMove: { from: m.from, to: m.to },
        lastPlayerMove: m,
        phase: 'judging',
        verdict: null,
      };
    }

    case 'VERDICT': {
      if (state.phase !== 'judging') return state;
      const next = { ...state, verdict: event.verdict };
      if (event.verdict.kind === 'bad') return finish(next, false, 'bad-move');

      const objective = state.puzzle.objective;
      const played = state.lastPlayerMove;
      if (played?.isCheckmate) return finish(next, true, 'checkmate');
      if (played && drawnOnBoard(played, state.seen)) {
        return objective === 'draw' ? finish(next, true, 'draw-reached') : finish(next, false, 'drawn-instead');
      }

      const { rules } = state;

      if (objective === 'draw' && state.playerMoveCount >= rules.drawHoldMoves) {
        return finish(next, true, 'held-draw');
      }
      if (objective === 'win' && rules.maxPlayerMoves !== null && state.playerMoveCount >= rules.maxPlayerMoves) {
        return finish(next, true, 'still-winning');
      }
      if (state.playerMoveCount >= rules.hardCapMoves) {
        return finish(next, objective === 'draw', objective === 'draw' ? 'held-draw' : 'too-long');
      }
      return { ...next, phase: 'opponentThinking' };
    }

    case 'OPPONENT_MOVED': {
      if (state.phase !== 'opponentThinking') return state;
      const m = event.move;
      const seen = [...state.seen, positionKey(m.fen)];
      const next: SessionState = {
        ...state,
        fen: m.fen,
        seen,
        moves: [...state.moves, { san: m.san, uci: m.uci, by: 'opponent' }],
        lastMove: { from: m.from, to: m.to },
        phase: 'awaitingPlayer',
      };
      if (drawnOnBoard(m, seen)) {
        return state.puzzle.objective === 'draw'
          ? finish(next, true, 'draw-reached')
          : finish(next, false, 'drawn-instead');
      }
      return next;
    }
  }
}
