// État du compte en ligne et actions (connexion, 2FA, synchronisation…).

import type { Factor, Session, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authErrorMessage, cloudEnabled, getCloud, markResetRequested, openedFromEmailLink, openedFromResetLink, passwordProblem, recoveryDetected } from '../services/cloud';
import type { PlayerStore } from '../services/playerStore';
import { flush, linkedUser, linkPlayer, pendingCount, playerOfUser, pull, unlinkPlayer } from '../services/sync';

/** Client Supabase (chargé à part, voir getCloud). */
async function sb(): Promise<SupabaseClient> {
  const c = await getCloud();
  if (!c) throw 'Comptes en ligne indisponibles.';
  return c;
}

export interface CloudAccount {
  enabled: boolean;
  session: Session | null;
  email: string | null;
  /** Mot de passe correct mais code 2FA encore attendu. */
  needMfa: boolean;
  /** Arrivée par le lien « mot de passe oublié » : saisir le nouveau. */
  recovery: boolean;
  busy: boolean;
  message: { tone: 'ok' | 'error'; text: string } | null;
  pending: number;
  lastSync: number | null;
  totpFactors: Factor[];
  enrolling: { factorId: string; qr: string; secret: string } | null;
  signIn(email: string, password: string, captchaToken?: string): Promise<void>;
  signUp(email: string, password: string, captchaToken?: string): Promise<void>;
  resetPassword(email: string, captchaToken?: string): Promise<void>;
  setNewPassword(password: string): Promise<void>;
  verifyMfa(code: string): Promise<void>;
  startMfaEnroll(): Promise<void>;
  confirmMfaEnroll(code: string): Promise<void>;
  cancelMfaEnroll(): Promise<void>;
  disableMfa(factorId: string): Promise<void>;
  syncNow(): Promise<void>;
  signOut(everywhere: boolean): Promise<void>;
  deleteAccount(confirmEmail: string): Promise<void>;
  /** Délie le profil local du compte et se déconnecte sur cet appareil. */
  unlinkProfile(): Promise<void>;
  /** Pseudo public et participation au classement (null tant que non chargé). */
  publicProfile: { pseudo: string; leaderboard: boolean } | null;
  setLeaderboard(on: boolean, pseudo: string): Promise<void>;
}

const appUrl = () => `${window.location.origin}${window.location.pathname}`;
const pseudoFrom = (s: string) => s.replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 30).padEnd(2, '_');

export function useCloudAccount(
  store: PlayerStore,
  playerId: string | null,
  onPlayerChange: (id: string | null) => void,
): CloudAccount {
  const [session, setSession] = useState<Session | null>(null);
  const [needMfa, setNeedMfa] = useState(false);
  const [recovery, setRecovery] = useState(openedFromResetLink);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<CloudAccount['message']>(null);
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [totpFactors, setTotpFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState<CloudAccount['enrolling']>(null);
  const [publicProfile, setPublicProfile] = useState<CloudAccount['publicProfile']>(null);
  const linkedFor = useRef<string | null>(null);

  const ok = (text: string) => setMessage({ tone: 'ok', text });
  const fail = (e: unknown) => setMessage({ tone: 'error', text: typeof e === 'string' ? e : authErrorMessage(e) });

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, []);

  // Session : lecture initiale + suivi des changements.
  useEffect(() => {
    if (!cloudEnabled) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    void sb().then((cloud) => {
      if (cancelled) return;
      void cloud.auth.getSession().then(({ data }) => {
        setSession(data.session);
        if (data.session && recoveryDetected()) setRecovery(true);
        if (openedFromEmailLink && !data.session) {
          setRecovery(false);
          setMessage({
            tone: 'error',
            text: openedFromResetLink
              ? 'Lien de réinitialisation expiré ou déjà utilisé : redemandez-en un (« Mot de passe oublié ? »).'
              : 'Ce lien a été ouvert dans un autre navigateur que celui de la demande. S’il s’agissait de la confirmation de votre email, elle est faite : connectez-vous. Pour un mot de passe oublié, refaites la demande depuis ce navigateur-ci.',
          });
        }
      });
      const { data } = cloud.auth.onAuthStateChange((event, s) => {
        // Pas d'appel Supabase ici (recommandation de la doc) : on met à jour l'état.
        setSession(s);
        if (event === 'PASSWORD_RECOVERY') setRecovery(true);
        if (event === 'SIGNED_OUT') {
          setNeedMfa(false);
          setTotpFactors([]);
          linkedFor.current = null;
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => {
      /* bibliothèque non chargée (hors ligne) : l'appli reste utilisable en local */
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Niveau d'authentification : 2FA à valider ? facteurs existants ?
  useEffect(() => {
    if (!cloudEnabled || !session) return;
    let cancelled = false;
    void (async () => {
      const { data: aal } = await (await sb()).auth.mfa.getAuthenticatorAssuranceLevel();
      const { data: factors } = await (await sb()).auth.mfa.listFactors();
      if (cancelled) return;
      setNeedMfa(aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2');
      setTotpFactors((factors?.totp ?? []).filter((f) => f.status === 'verified'));
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const syncProfile = useCallback(
    async (pid: string) => {
      await flush(pid);
      const added = await pull(store, pid);
      setPending(pendingCount(pid));
      setLastSync(Date.now());
      return added;
    },
    [store],
  );

  // Connexion complète (2FA comprise) : lier un profil local puis synchroniser.
  useEffect(() => {
    if (!cloudEnabled || !session || needMfa || recovery) return;
    const userId = session.user.id;
    if (linkedFor.current === userId) return;
    linkedFor.current = userId;
    void (async () => {
      try {
        let pid = playerOfUser(userId);
        if (!pid) {
          if (playerId && !linkedUser(playerId)) pid = playerId; // reprise du profil en cours
          else {
            const { data: prof } = await (await sb()).from('profiles').select('pseudo').maybeSingle();
            pid = store.createPlayer(prof?.pseudo ?? (session.user.email ?? 'Joueur').split('@')[0]).id;
          }
          linkPlayer(store, pid, userId);
        }
        const name = store.listPlayers().find((p) => p.id === pid)?.name ?? 'Joueur';
        await (await sb()).from('profiles').upsert({ user_id: userId, pseudo: pseudoFrom(name) }, { onConflict: 'user_id', ignoreDuplicates: true });
        onPlayerChange(pid);
        const added = await syncProfile(pid);
        ok(added ? `Synchronisé : ${added} entrée(s) récupérée(s) du compte.` : 'Synchronisé.');
      } catch (e) {
        linkedFor.current = null;
        // Connexion réussie mais échange de données refusé : ne pas parler d'identifiants.
        const code = (e as { code?: string } | null)?.code;
        fail(`Connecté, mais synchronisation impossible${code ? ` (code : ${code})` : ''}. Vos parties restent enregistrées sur cet appareil ; réessayez plus tard.`);
      }
    })();
  }, [session, needMfa, recovery, playerId, store, onPlayerChange, syncProfile]);

  // Pseudo public et participation au classement.
  useEffect(() => {
    if (!cloudEnabled || !session || needMfa || recovery) {
      setPublicProfile(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await (await sb()).from('profiles').select('pseudo, leaderboard').maybeSingle();
        if (!cancelled && data) setPublicProfile({ pseudo: data.pseudo, leaderboard: !!data.leaderboard });
      } catch {
        /* colonne absente (migration 0004 non exécutée) ou réseau : réglage masqué */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, needMfa, recovery, lastSync]);

  useEffect(() => {
    if (playerId) setPending(pendingCount(playerId));
  }, [playerId, lastSync]);

  return {
    enabled: cloudEnabled,
    session,
    email: session?.user.email ?? null,
    needMfa,
    recovery,
    busy,
    message,
    pending,
    lastSync,
    totpFactors,
    enrolling,

    signIn: (email, password, captchaToken) =>
      run(async () => {
        const { error } = await (await sb()).auth.signInWithPassword({ email, password, options: { captchaToken } });
        if (error) throw error;
      }),

    signUp: (email, password, captchaToken) =>
      run(async () => {
        const problem = passwordProblem(password, email);
        if (problem) throw problem;
        const { error } = await (await sb()).auth.signUp({ email, password, options: { captchaToken, emailRedirectTo: appUrl() } });
        if (error && error.code !== 'user_already_exists') throw error;
        // Même message que le compte existe ou non (pas de divulgation).
        ok('Si cette adresse peut être utilisée, un email de confirmation vient d’être envoyé. Cliquez sur le lien, puis connectez-vous.');
      }),

    resetPassword: (email, captchaToken) =>
      run(async () => {
        markResetRequested();
        const { error } = await (await sb()).auth.resetPasswordForEmail(email, { redirectTo: appUrl(), captchaToken });
        if (error && error.status === 429) throw error;
        ok('Si un compte existe pour cette adresse, un email de réinitialisation vient d’être envoyé. Ouvrez le lien dans CE navigateur.');
      }),

    setNewPassword: (password) =>
      run(async () => {
        const problem = passwordProblem(password, session?.user.email ?? '');
        if (problem) throw problem;
        const { error } = await (await sb()).auth.updateUser({ password });
        if (error) throw error;
        setRecovery(false);
        markResetRequested(true);
        linkedFor.current = null;
        ok('Mot de passe modifié.');
      }),

    verifyMfa: (code) =>
      run(async () => {
        const factor = (await (await sb()).auth.mfa.listFactors()).data?.totp.find((f) => f.status === 'verified');
        if (!factor) throw 'Aucun facteur 2FA trouvé.';
        const { error } = await (await sb()).auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
        if (error) throw error;
        setNeedMfa(false);
      }),

    startMfaEnroll: () =>
      run(async () => {
        const { data, error } = await (await sb()).auth.mfa.enroll({ factorType: 'totp', friendlyName: `Endgame Rush ${Date.now()}` });
        if (error) throw error;
        setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      }),

    confirmMfaEnroll: (code) =>
      run(async () => {
        if (!enrolling) return;
        const { error } = await (await sb()).auth.mfa.challengeAndVerify({ factorId: enrolling.factorId, code: code.trim() });
        if (error) throw error;
        setEnrolling(null);
        const { data } = await (await sb()).auth.mfa.listFactors();
        setTotpFactors((data?.totp ?? []).filter((f) => f.status === 'verified'));
        ok('Double authentification activée. Elle sera demandée à chaque connexion.');
      }),

    cancelMfaEnroll: () =>
      run(async () => {
        if (enrolling) await (await sb()).auth.mfa.unenroll({ factorId: enrolling.factorId });
        setEnrolling(null);
      }),

    disableMfa: (factorId) =>
      run(async () => {
        const { error } = await (await sb()).auth.mfa.unenroll({ factorId });
        if (error) throw error;
        setTotpFactors((f) => f.filter((x) => x.id !== factorId));
        ok('Double authentification désactivée.');
      }),

    syncNow: () =>
      run(async () => {
        if (!playerId || !linkedUser(playerId)) throw 'Ce profil n’est pas lié au compte.';
        try {
          const added = await syncProfile(playerId);
          ok(added ? `Synchronisé : ${added} entrée(s) récupérée(s).` : 'Synchronisé.');
        } catch (e) {
          const code = (e as { code?: string } | null)?.code;
          throw `Synchronisation impossible${code ? ` (code : ${code})` : ''}. Vos parties restent enregistrées sur cet appareil.`;
        }
      }),

    signOut: (everywhere) =>
      run(async () => {
        await (await sb()).auth.signOut({ scope: everywhere ? 'global' : 'local' });
        ok(everywhere ? 'Déconnecté de tous les appareils.' : 'Déconnecté. Le profil reste disponible hors ligne sur cet appareil.');
      }),

    deleteAccount: (confirmEmail) =>
      run(async () => {
        if (!session?.user.email || confirmEmail.trim().toLowerCase() !== session.user.email.toLowerCase())
          throw 'L’email saisi ne correspond pas au compte.';
        const { error } = await (await sb()).rpc('delete_my_account');
        if (error) throw error;
        const pid = playerOfUser(session.user.id);
        if (pid) unlinkPlayer(pid);
        await (await sb()).auth.signOut({ scope: 'local' });
        ok('Compte en ligne et données en ligne supprimés. Le profil local reste sur cet appareil.');
      }),

    publicProfile,
    setLeaderboard: (on, pseudo) =>
      run(async () => {
        const clean = pseudo.trim();
        if (!/^[\p{L}\p{N} _.-]{2,30}$/u.test(clean)) throw 'Pseudo : 2 à 30 caractères (lettres, chiffres, espace, _ . -).';
        if (!session) throw 'Non connecté.';
        const { error } = await (await sb()).from('profiles').update({ pseudo: clean, leaderboard: on }).eq('user_id', session.user.id);
        if (error?.code === '23505') throw 'Ce pseudo est déjà utilisé dans le classement : choisissez-en un autre.';
        if (error?.code === '23514') throw 'Pseudo refusé : 2 à 30 caractères (lettres, chiffres, espace, _ . -).';
        if (error) throw error;
        setPublicProfile({ pseudo: clean, leaderboard: on });
        ok(on ? `Vous apparaissez dans le classement sous le pseudo « ${clean} » (mise à jour sous 5 min).` : 'Vous n’apparaissez plus dans le classement (mise à jour sous 5 min).');
      }),

    unlinkProfile: () =>
      run(async () => {
        if (playerId) unlinkPlayer(playerId);
        await (await sb()).auth.signOut({ scope: 'local' });
        setPending(0);
        ok('Profil délié et déconnecté sur cet appareil (les données en ligne sont conservées).');
      }),
  };
}
