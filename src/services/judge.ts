// Arbitre partagé par toute l'application.
import { createMoveJudge } from './moveJudge';
import { stockfish } from './stockfish';
import { tablebase } from './tablebaseClient';

export const judge = createMoveJudge(tablebase, stockfish);
