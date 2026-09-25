// Glicko-2 (Mark Glickman, « Example of the Glicko-2 system », glicko.net/glicko/glicko2.pdf).
// Vérifié sur l'exemple de l'article (tests/glicko2.test.ts).

const SCALE = 173.7178;
const EPS = 0.000001;

export interface Rating {
  r: number; // Elo (échelle Glicko)
  rd: number; // écart-type de la mesure
  vol: number; // volatilité
}

export interface Opponent {
  r: number;
  rd: number;
  /** Résultat : 1 = gagné, 0 = perdu, 0,5 = nulle. */
  s: number;
}

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu: number, muj: number, phij: number) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

/** Une période de notation (un ou plusieurs résultats). */
export function updateRating(player: Rating, games: Opponent[], tau: number): Rating {
  const mu = (player.r - 1500) / SCALE;
  const phi = player.rd / SCALE;
  if (games.length === 0) {
    return { ...player, rd: Math.min(350 * 10, SCALE * Math.sqrt(phi * phi + player.vol * player.vol)) };
  }
  const opp = games.map((o) => ({ mu: (o.r - 1500) / SCALE, phi: o.rd / SCALE, s: o.s }));
  const v = 1 / opp.reduce((acc, o) => acc + g(o.phi) ** 2 * E(mu, o.mu, o.phi) * (1 - E(mu, o.mu, o.phi)), 0);
  const sum = opp.reduce((acc, o) => acc + g(o.phi) * (o.s - E(mu, o.mu, o.phi)), 0);
  const delta = v * sum;

  // Nouvelle volatilité (algorithme d'Illinois, étape 5 de l'article).
  const a = Math.log(player.vol * player.vol);
  const f = (x: number) =>
    (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) / (2 * (phi * phi + v + Math.exp(x)) ** 2) - (x - a) / (tau * tau);
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPS) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else fA /= 2;
    B = C;
    fB = fC;
  }
  const vol = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * sum;
  return { r: SCALE * muNew + 1500, rd: SCALE * phiNew, vol };
}
