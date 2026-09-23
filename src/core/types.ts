// Types partagés du cœur de l'application (aucune dépendance React).

export type Color = 'w' | 'b';

/** Ce que le joueur doit obtenir dans la position. */
export type Objective = 'win' | 'draw';

export type Level = 'debutant' | 'intermediaire' | 'avance' | 'master';

/** Famille de finale, calculée depuis le matériel (cf. material.ts). */
export type Family = 'pions' | 'tours' | 'dames' | 'cavaliers' | 'fous' | 'mixte' | 'mats';

/** Collection d'origine d'un puzzle. */
export type Collection = 'bases' | 'lichess';

export interface Puzzle {
  id: string;
  title: string;
  /** Position présentée au joueur (c'est au joueur de jouer). */
  fen: string;
  objective: Objective;
  collection: Collection;
  level: Level;
  /** Estimation Elo — sert à la montée de difficulté (Streak). */
  rating: number;
  /** Idée clé affichée au joueur. */
  concept: string;
}

/** Résultat théorique vu par un camp. */
export type Outcome = 'win' | 'draw' | 'loss' | 'unknown';

export interface Move {
  from: string;
  to: string;
  promotion?: PromotionPiece;
}

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';
