// Paramètres d'intégration lus dans l'URL, pour insérer l'appli dans un site
// (iframe). Exemple :
//   index.html?embed=1&mode=storm&theme=tours&level=1200
//  - embed=1  : affichage compact (sans en-tête ni pied de page)
//  - mode     : storm | streak | training
//  - theme    : mix | bases | pions | tours | dames | fous | cavaliers | mixte
//  - level    : Elo de départ (600, 1200, 1600, 2000…)
//  - sub      : sous-thème (ex. rp-r = tour et pion contre tour)
// En fin de partie, l'appli envoie au site parent un message
//   { type: 'cer:result', mode, theme, level, score, bestCombo, errors }
// (window.postMessage), que le site peut écouter pour afficher le score.

export interface EmbedOptions {
  embed: boolean;
  mode?: 'storm' | 'streak' | 'training';
  theme?: string;
  level?: number;
  /** Sous-thème (ex. « rp-r »), cf. core/categories.ts. */
  sub?: string;
}

const MODES = new Set(['storm', 'streak', 'training']);
const THEMES = new Set(['mix', 'bases', 'pions', 'tours', 'dames', 'fous', 'cavaliers', 'mixte']);

export function readEmbedOptions(search: string = window.location.search): EmbedOptions {
  const params = new URLSearchParams(search);
  const mode = params.get('mode') ?? undefined;
  const theme = params.get('theme') ?? undefined;
  const level = Number(params.get('level'));
  return {
    embed: params.get('embed') === '1' || window.self !== window.top,
    mode: mode && MODES.has(mode) ? (mode as EmbedOptions['mode']) : undefined,
    theme: theme && THEMES.has(theme) ? theme : undefined,
    level: Number.isFinite(level) && level >= 400 && level <= 3000 ? level : undefined,
    sub: /^[a-z0-9-]{2,24}$/.test(params.get('sub') ?? '') ? params.get('sub')! : undefined,
  };
}

export function notifyParent(message: Record<string, unknown>): void {
  if (window.parent === window) return;
  try {
    window.parent.postMessage({ type: 'cer:result', ...message }, '*');
  } catch {
    /* site parent inaccessible : sans conséquence */
  }
}
