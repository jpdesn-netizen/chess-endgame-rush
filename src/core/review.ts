// Révision des erreurs (répétition espacée), calculée à partir de l'historique :
// rien de plus à stocker, et donc synchronisé avec le compte en ligne.
//
//  - Seuls les puzzles déjà RATÉS au moins une fois entrent en révision.
//  - Après un échec : à revoir le lendemain. Chaque réussite en révision espace
//    la suivante : 1 j → 3 j → 7 j → 14 j ; au bout de 4 réussites d'affilée
//    depuis le dernier échec, le puzzle est considéré comme acquis.
//  - Un nouvel échec remet le compteur à zéro.

export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14];
export const MASTERED_AFTER = REVIEW_INTERVAL_DAYS.length;
const DAY = 86_400_000;

export interface AttemptLite {
  t: number;
  p: string;
  ok: boolean;
}

export interface ReviewItem {
  id: string;
  failures: number;
  /** Réussites d'affilée depuis le dernier échec. */
  streak: number;
  lastT: number;
  /** Date (ms) à partir de laquelle le puzzle est à revoir. */
  due: number;
}

/** Puzzles ratés et pas encore acquis, du plus urgent au moins urgent. */
export function reviewItems(attempts: AttemptLite[]): ReviewItem[] {
  const byId = new Map<string, AttemptLite[]>();
  for (const a of attempts) {
    const list = byId.get(a.p);
    if (list) list.push(a);
    else byId.set(a.p, [a]);
  }
  const items: ReviewItem[] = [];
  for (const [id, list] of byId) {
    list.sort((x, y) => x.t - y.t);
    const lastFail = list.map((a) => a.ok).lastIndexOf(false);
    if (lastFail < 0) continue; // jamais raté : pas en révision
    const streak = list.length - 1 - lastFail;
    if (streak >= MASTERED_AFTER) continue; // acquis
    const lastT = list[list.length - 1].t;
    items.push({ id, failures: list.filter((a) => !a.ok).length, streak, lastT, due: lastT + REVIEW_INTERVAL_DAYS[streak] * DAY });
  }
  return items.sort((a, b) => a.due - b.due);
}

export const dueNow = (items: ReviewItem[], now: number) => items.filter((i) => i.due <= now);
