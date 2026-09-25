// Paramètres réglables de l'application. Toutes les valeurs validées
// ensemble sont regroupées ici pour pouvoir les ajuster sans toucher au code.

export const CONFIG = {
  /**
   * Un thème ou sous-thème n'est proposé que s'il compte au moins autant
   * d'exercices : une partie ne répète jamais un exercice, il faut donc
   * un réservoir suffisant à tous les niveaux.
   */
  minPuzzlesPerTheme: 100,
  tablebase: {
    url: 'https://tablebase.lichess.ovh/standard',
    /** Les tables Syzygy couvrent jusqu'à 7 pièces (rois compris). */
    maxPieces: 7,
    /** Nouvelles tentatives en cas d'erreur réseau ou serveur (hors 429). */
    retries: 2,
    retryDelayMs: 800,
  },
  engine: {
    /**
     * Stockfish, pour les positions de plus de 7 pièces.
     * movetimeMs : temps de réflexion par analyse.
     * Un coup est accepté si l'évaluation reste ≥ min(seuil, meilleure − tolérance).
     * Ex. objectif gain : seuil +2,0 pions, tolérance 1,0 pion.
     */
    movetimeMs: 300,
    winThresholdCp: 200,
    drawThresholdCp: -50,
    toleranceCp: 100,
  },
  judge: {
    /**
     * Décision G : un coup qui conserve le gain est refusé s'il rallonge
     * la distance à la victoire de plus de N coups (N × 2 demi-coups)
     * par rapport au meilleur coup.
     */
    slowMoveToleranceMoves: 10,
  },
  modes: {
    /** Entraînement (jalon 1) : jusqu'au mat, avec une limite de sécurité. */
    training: { maxPlayerMoves: null as number | null, hardCapMoves: 50, drawHoldMoves: 6 },
    /**
     * Décision H : 6 coups du joueur maximum par puzzle en mode Rush.
     * Storm : 3 min, +3 s par réussite, −10 s par erreur (cahier des charges).
     * eloStep : hausse de difficulté après chaque réussite (valeur à ajuster).
     */
    storm: { maxPlayerMoves: 6, durationMs: 180_000, bonusMs: 3_000, penaltyMs: 10_000, eloStep: 40 },
    /** Décision C : montée de difficulté à chaque réussite. */
    streak: { maxPlayerMoves: 6, eloStep: 30 },
    /** Pause après un puzzle, pour voir le dernier coup (ms). */
    rushPauseAfterSuccessMs: 150,
    rushPauseAfterFailureMs: 1_000,
  },
  /** Niveaux de départ proposés pour les modes Rush (Elo). */
  startLevels: [
    { id: 'debutant', label: 'Débutant', rating: 600 },
    { id: 'intermediaire', label: 'Intermédiaire', rating: 1200 },
    { id: 'avance', label: 'Avancé', rating: 1600 },
    { id: 'master', label: 'Master', rating: 2000 },
  ],
  ui: {
    /** Délai minimal avant la réponse adverse, pour que le coup reste lisible. */
    opponentMinDelayMs: 120,
  },
} as const;

export type ModeRules = {
  /** null = jouer jusqu'au mat (objectif gain). */
  maxPlayerMoves: number | null;
  /** Nombre de coups à tenir quand l'objectif est la nulle. */
  drawHoldMoves: number;
  /** Limite absolue de coups du joueur. */
  hardCapMoves: number;
};

/**
 * Mode technique : une position de partie réelle (≤ 7 pièces) jouée jusqu'au
 * bout contre la table de finales : mat, ou nulle tenue 20 coups.
 */
export const TECHNIQUE_RULES: ModeRules = { maxPlayerMoves: null, hardCapMoves: 60, drawHoldMoves: 20 };

export const TRAINING_RULES: ModeRules = {
  maxPlayerMoves: CONFIG.modes.training.maxPlayerMoves,
  drawHoldMoves: CONFIG.modes.training.drawHoldMoves,
  hardCapMoves: CONFIG.modes.training.hardCapMoves,
};

/**
 * Règles d'un puzzle en mode Rush : on s'arrête à la longueur de la ligne
 * Lichess (plafonnée à 6 coups, décision H), sinon à 6 coups.
 */
export function rushRules(solution: string[] | undefined): ModeRules {
  const cap = CONFIG.modes.storm.maxPlayerMoves;
  const lineMoves = solution && solution.length > 0 ? Math.ceil(solution.length / 2) : cap;
  const moves = Math.min(cap, lineMoves);
  return { maxPlayerMoves: moves, drawHoldMoves: moves, hardCapMoves: CONFIG.modes.training.hardCapMoves };
}
