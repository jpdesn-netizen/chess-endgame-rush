// Connexion à Supabase (comptes en ligne). Sans configuration, l'appli
// fonctionne comme avant, en local uniquement.
//
// Sécurité : seule la clé PUBLIQUE est utilisée ici. Les données sont
// protégées côté serveur par les règles RLS (supabase/migrations/0001_comptes.sql).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (key && /^sb_secret_|service_role/.test(key)) {
  // Garde-fou : une clé secrète dans le navigateur contournerait toute la sécurité.
  throw new Error('Clé Supabase SECRÈTE détectée dans la configuration du site : utilisez la clé « publishable ».');
}

export const cloud: SupabaseClient | null =
  url && key && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)
    ? createClient(url, key, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

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
  return 'Identifiants incorrects, ou compte pas encore confirmé par email.';
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
