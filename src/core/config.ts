// Paramètres réglables de l'application. Toutes les valeurs validées
// ensemble sont regroupées ici pour pouvoir les ajuster sans toucher au code.

export const CONFIG = {
  tablebase: {
    url: 'https://tablebase.lichess.ovh/standard',
    /** Les tables Syzygy couvrent jusqu'à 7 pièces (rois compris). */
    maxPieces: 7,
    /** Nouvelles tentatives en cas d'erreur réseau ou serveur (hors 429). */
    retries: 2,
    retryDelayMs: 800,
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
    /** Décision H : 6 coups du joueur maximum en Storm. */
    storm: { maxPlayerMoves: 6, durationMs: 180_000, bonusMs: 3_000, penaltyMs: 10_000 },
    /** Décision C : montée de difficulté à chaque réussite. */
    streak: { maxPlayerMoves: 6, eloStep: 30 },
  },
  ui: {
    /** Délai minimal avant la réponse adverse, pour que le coup reste lisible. */
    opponentMinDelayMs: 250,
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

export const TRAINING_RULES: ModeRules = {
  maxPlayerMoves: CONFIG.modes.training.maxPlayerMoves,
  drawHoldMoves: CONFIG.modes.training.drawHoldMoves,
  hardCapMoves: CONFIG.modes.training.hardCapMoves,
};
