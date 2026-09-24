/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL du projet Supabase (https://xxxx.supabase.co). Absente : comptes en ligne désactivés. */
  readonly VITE_SUPABASE_URL?: string;
  /** Clé PUBLIQUE « publishable » (sb_publishable_…). Jamais la clé secrète. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Clé de site Cloudflare Turnstile (anti-robots), facultative. */
  readonly VITE_TURNSTILE_SITEKEY?: string;
  /** Origines autorisées à intégrer l'appli et à recevoir les scores (séparées par des virgules). */
  readonly VITE_PARENT_ORIGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
