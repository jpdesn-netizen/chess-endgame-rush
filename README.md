# Chess Endgame Rush

Entraînement aux finales d'échecs inspiré de Lichess Puzzle Storm / Streak.
Chaque coup est jugé par la **table de finales Lichess** (Syzygy, jusqu'à 7 pièces).

## Lancer l'application

```
npm install        # une seule fois
npm run dev        # puis ouvrir http://localhost:5173
```

Autres commandes :

| Commande | Rôle |
|---|---|
| `npm test` | Tests unitaires du cœur (règles, juge, session, données) |
| `npm run verify:puzzles` | Revérifie les positions auprès de la table de finales (Internet requis) |
| `npm run build` | Contrôle des types + version de production dans `dist/` |

## Architecture

```
src/core/            logique pure, sans React
  chessRules.ts      seul fichier qui importe chess.js
  fen.ts, material.ts  lecture du FEN, classement par matériel
  judge/             verdict d'un coup (table de finales) et défense adverse
  session/           déroulement d'un puzzle (reducer pur)
  config.ts          tous les réglages (tolérance G, limite H, Storm, Streak)
src/services/        accès réseau à la table de finales (cache, relances)
src/data/            puzzlesMock.ts — collection « Bases » vérifiée
src/hooks/           lien entre le cœur et React
src/components/      échiquier SVG, textes de retour
src/screens/         écrans Accueil et Jeu
tests/               tests Node (node:test via tsx)
scripts/             vérification des positions
```

## Règles de jugement (validées)

- **Gain** : un coup est bon s'il conserve le gain et ne rallonge pas le mat de plus de 10 coups
  par rapport au meilleur coup (distance au mat si disponible, sinon DTZ).
- **Nulle** : un coup est bon s'il conserve la nulle.
- **Adversaire** : il joue la défense la plus résistante selon la table.
- **Entraînement** (jalon 1) : on joue jusqu'au mat (limite de sécurité 50 coups) ; objectif nulle : tenir 6 coups.
- **Storm** : 6 coups du joueur maximum par puzzle.
