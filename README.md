# Chess Endgame Rush

Entraînement aux finales d'échecs inspiré de Lichess Puzzle Storm / Streak.

- **Storm** : 3 min, +3 s par réussite, −10 s par erreur ; le chrono démarre au premier coup.
- **Streak** : difficulté croissante, la série s'arrête à la première erreur.
- **Entraînement** : 11 positions théoriques « Bases », jusqu'au mat.
- Environ 6 000 finales issues de parties réelles (base de puzzles Lichess, CC0).
- Chaque coup est jugé par la **table de finales Syzygy** (API Lichess) jusqu'à 7 pièces,
  et par **Stockfish** (dans le navigateur) au-delà.

## Lancer l'application

```
npm install        # une seule fois (copie aussi le moteur Stockfish dans public/)
npm run dev        # puis ouvrir http://localhost:5173
```

| Commande | Rôle |
|---|---|
| `npm test` | Tests unitaires (règles, juges, sessions, Rush, données) |
| `npm run build` | Contrôle des types + version de production dans `dist/` |
| `npm run preview` | Sert localement la version de production |
| `npm run verify:puzzles` | Revérifie les positions « Bases » auprès de la table de finales |
| `npm run import:lichess` | Régénère `public/data/lichess-endgames.json` depuis la base Lichess décompressée |

## Intégrer l'application dans un site web

1. `npm run build` produit un dossier `dist/` **autonome** (chemins relatifs).
2. Déposer le contenu de `dist/` sur n'importe quel hébergement statique,
   par exemple dans `https://mon-club.fr/finales/` (FTP, GitHub Pages, Netlify…).
   Le serveur doit servir les fichiers `.wasm` avec le type `application/wasm`
   (c'est le cas de la plupart des hébergeurs ; sinon, ajouter ce type MIME).
3. Dans la page du site (WordPress : bloc « HTML personnalisé ») :

```html
<iframe
  src="https://mon-club.fr/finales/index.html?embed=1&mode=storm&theme=mix&level=1200"
  style="width:100%; max-width:1100px; aspect-ratio: 4 / 3; border:0; border-radius:12px"
  allow="autoplay"
  title="Chess Endgame Rush"></iframe>
```

Paramètres d'URL (tous facultatifs) :

| Paramètre | Valeurs | Effet |
|---|---|---|
| `embed` | `1` | Affichage compact (automatique dans un iframe) |
| `mode` | `storm`, `streak`, `training` | Mode présélectionné |
| `theme` | `mix`, `pions`, `tours`, `dames`, `fous`, `cavaliers`, `mixte`, `bases` | Thème présélectionné |
| `level` | `600`, `1200`, `1600`, `2000`… | Elo de départ |

En fin de partie, l'application envoie au site parent un message
`{ type: 'cer:result', mode, theme, level, score, bestCombo, errors }` :

```html
<script>
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'cer:result') console.log('Score :', e.data.score);
  });
</script>
```

Accès réseau nécessaire côté joueur : `tablebase.lichess.ovh` (table de finales).

## Licences

- **Code de l'application : GPL v3 ou ultérieure**, imposée par deux composants :
  - chessground (`@lichess-org/chessground`, l'échiquier de Lichess) — GPL v3+ ;
  - Stockfish.js (`stockfish`, N. Rugg / Chess.com) — GPL v3.
  Mettre l'application en ligne revient à la distribuer : son code source doit
  alors être mis à disposition sous la même licence (ex. dépôt GitHub public).
- Positions : base de puzzles Lichess, domaine public (CC0).

## Architecture

```
src/core/              logique pure, sans React (testée)
  chessRules.ts        seul fichier qui importe chess.js
  fen.ts, material.ts  lecture du FEN, classement par matériel
  judge/               verdicts : table de finales, moteur, ligne de la partie, défense
  session/             déroulement d'un puzzle (reducer pur)
  rush/                règles Storm / Streak (reducer pur), choix du puzzle suivant
  config.ts            tous les réglages (tolérances, chronos, seuils moteur…)
src/services/          table de finales (cache), Stockfish (Web Worker), arbitre, sons, records
src/data/              positions « Bases » et chargement des finales Lichess
src/hooks/             lien entre le cœur et React
src/components/        échiquier (chessground), promotion, textes de retour
src/screens/           Accueil, Rush, Entraînement
src/embed.ts           paramètres d'intégration et message au site parent
tests/                 tests Node (node:test via tsx)
scripts/               import Lichess, copie de Stockfish, vérification des positions
```

## Règles de jugement

- **≤ 7 pièces (table de finales)** : un coup est bon s'il conserve le résultat théorique ;
  en position gagnante, il ne doit pas rallonger le gain de plus de 10 coups.
- **> 7 pièces (Stockfish, 0,3 s par analyse)** : un coup est bon si l'évaluation reste
  ≥ min(+2,0, meilleure − 1,0) pour gagner, ≥ min(−0,5, meilleure − 1,0) pour tenir.
- Le coup joué dans la partie réelle est toujours accepté ; l'adversaire rejoue la
  partie tant qu'elle est aussi bonne que la meilleure défense.
- Rush : un puzzle se termine à la longueur de la ligne Lichess (6 coups maximum).
