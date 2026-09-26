// Connexion à Supabase (comptes en ligne). Sans configuration, l'appli
// fonctionne comme avant, en local uniquement.
//
// Sécurité : seule la clé PUBLIQUE est utilisée ici. Les données sont
// protégées côté serveur par les règles RLS (supabase/migrations/0001_comptes.sql).

import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (key && /^sb_secret_|service_role/.test(key)) {
  // Garde-fou : une clé secrète dans le navigateur contournerait toute la sécurité.
  throw new Error('Clé Supabase SECRÈTE détectée dans la configuration du site : utilisez la clé « publishable ».');
}

// --- Retour depuis un lien reçu par email -------------------------------
// Lu AVANT la création du client : la bibliothèque retire ensuite le code de l'URL.
const RESET_KEY = 'endgameRush:v1:resetRequestedAt';
const readResetAt = () => {
  try {
    return Number(window.localStorage.getItem(RESET_KEY) ?? 0);
  } catch {
    return 0;
  }
};
/** La page a été ouverte depuis un lien d'email (confirmation ou mot de passe oublié). */
export const openedFromEmailLink = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code');
/** … et ce navigateur avait demandé une réinitialisation il y a moins de 2 h : c'est un retour « mot de passe oublié ». */
export const openedFromResetLink = openedFromEmailLink && Date.now() - readResetAt() < 2 * 3_600_000;

export function markResetRequested(done = false): void {
  try {
    if (done) window.localStorage.removeItem(RESET_KEY);
    else window.localStorage.setItem(RESET_KEY, String(Date.now()));
  } catch {
    /* stockage indisponible : on se fie à l'évènement de la bibliothèque */
  }
}

/** Comptes en ligne configurés pour ce site. */
export const cloudEnabled = !!(url && key && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url));

// Évènement « retour de réinitialisation » capté dès la création du client
// (avant que l'interface ne s'abonne, sinon il serait perdu).
let recoveryEvent = false;
let client: Promise<SupabaseClient | null> | null = null;

/**
 * Client Supabase, chargé à part (≈ 220 Ko de code) : l'accueil s'affiche sans
 * l'attendre. Le chargement démarre dès l'ouverture de l'appli.
 */
export function getCloud(): Promise<SupabaseClient | null> {
  if (!cloudEnabled) return Promise.resolve(null);
  client ??= import('./cloudClient')
    .then((m) => m.createCloudClient(url!, key!, () => (recoveryEvent = true)))
    .catch((e) => {
      client = null; // réseau coupé : on réessaiera au prochain appel
      throw e;
    });
  return client;
}
if (cloudEnabled) void getCloud().catch(() => {});

export const recoveryDetected = () => recoveryEvent || openedFromResetLink;

export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITEKEY || null;

/** Messages d'erreur neutres : ne révèlent pas si un email a un compte. */
export function authErrorMessage(error: unknown): string {
  const e = error as { status?: number; code?: string; message?: string } | null;
  const code = e?.code ?? '';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || e?.status === 429)
    return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (code === 'weak_password') return 'Mot de passe trop faible ou déjà divulgué publiquement : choisissez-en un autre.';
  if (code === 'captcha_failed') return 'Vérification anti-robot échouée. Réessayez.';
  if (code === 'mfa_verification_failed' || code === 'mfa_challenge_expired') return 'Code de vérification incorrect ou expiré.';
  if (code === 'same_password') return 'Le nouveau mot de passe doit être différent de l’ancien.';
  // Renvoyé seulement quand le mot de passe est correct : ne révèle rien à un tiers.
  if (code === 'email_not_confirmed') return 'Compte pas encore confirmé : cliquez sur le lien reçu par email (pensez aux spams).';
  // Envoi d'email refusé par le serveur (ex. service d'email pas encore configuré).
  if (code === 'email_address_not_authorized' || code === 'email_provider_disabled' || code === 'signup_disabled' || (e?.status ?? 0) >= 500)
    return 'Création de compte ou envoi d’email impossible pour le moment. Réessayez plus tard.';
  const generic = 'Identifiants incorrects, ou compte pas encore confirmé par email.';
  // Le code technique (sans information sur le compte) aide au diagnostic.
  return code && code !== 'invalid_credentials' ? `${generic} (code : ${code})` : generic;
}

/** Règle locale (la même doit être réglée dans Supabase → Auth → Password). */
export function passwordProblem(pw: string, email: string): string | null {
  if (pw.length < 12) return 'Au moins 12 caractères.';
  if (pw.length > 72) return '72 caractères au maximum.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return 'Mélangez minuscules, majuscules et chiffres.';
  const local = email.split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && pw.toLowerCase().includes(local)) return 'Le mot de passe ne doit pas contenir votre email.';
  return null;
}
