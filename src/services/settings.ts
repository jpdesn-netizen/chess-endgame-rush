// Réglages de l'appli, enregistrés dans le navigateur.

const KEY = 'endgameRush:v1:settings';

interface Settings {
  /** Répétition espacée des erreurs (sinon : liste libre des erreurs à retravailler). */
  spacedRepetition: boolean;
}

const DEFAULTS: Settings = { spacedRepetition: true };

export function getSettings(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...getSettings(), [key]: value }));
  } catch {
    /* sans stockage : réglage non conservé */
  }
}
