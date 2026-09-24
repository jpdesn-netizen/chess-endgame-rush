// État du compte en ligne et actions (connexion, 2FA, synchronisation…).

import type { Factor, Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authErrorMessage, cloud, passwordProblem } from '../services/cloud';
import type { PlayerStore } from '../services/playerStore';
import { flush, linkedUser, linkPlayer, pendingCount, playerOfUser, pull, unlinkPlayer } from '../services/sync';

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
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<CloudAccount['message']>(null);
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [totpFactors, setTotpFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState<CloudAccount['enrolling']>(null);
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
    if (!cloud) return;
    void cloud.auth.getSession().then(({ data }) => setSession(data.session));
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
    return () => data.subscription.unsubscribe();
  }, []);

  // Niveau d'authentification : 2FA à valider ? facteurs existants ?
  useEffect(() => {
    if (!cloud || !session) return;
    let cancelled = false;
    void (async () => {
      const { data: aal } = await cloud!.auth.mfa.getAuthenticatorAssuranceLevel();
      const { data: factors } = await cloud!.auth.mfa.listFactors();
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
    if (!cloud || !session || needMfa || recovery) return;
    const userId = session.user.id;
    if (linkedFor.current === userId) return;
    linkedFor.current = userId;
    void (async () => {
      try {
        let pid = playerOfUser(userId);
        if (!pid) {
          if (playerId && !linkedUser(playerId)) pid = playerId; // reprise du profil en cours
          else {
            const { data: prof } = await cloud!.from('profiles').select('pseudo').maybeSingle();
            pid = store.createPlayer(prof?.pseudo ?? (session.user.email ?? 'Joueur').split('@')[0]).id;
          }
          linkPlayer(store, pid, userId);
        }
        const name = store.listPlayers().find((p) => p.id === pid)?.name ?? 'Joueur';
        await cloud!.from('profiles').upsert({ user_id: userId, pseudo: pseudoFrom(name) }, { onConflict: 'user_id', ignoreDuplicates: true });
        onPlayerChange(pid);
        const added = await syncProfile(pid);
        ok(added ? `Synchronisé : ${added} entrée(s) récupérée(s) du compte.` : 'Synchronisé.');
      } catch (e) {
        linkedFor.current = null;
        fail(e instanceof Error ? `Synchronisation impossible : ${e.message}` : e);
      }
    })();
  }, [session, needMfa, recovery, playerId, store, onPlayerChange, syncProfile]);

  useEffect(() => {
    if (playerId) setPending(pendingCount(playerId));
  }, [playerId, lastSync]);

  return {
    enabled: !!cloud,
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
        const { error } = await cloud!.auth.signInWithPassword({ email, password, options: { captchaToken } });
        if (error) throw error;
      }),

    signUp: (email, password, captchaToken) =>
      run(async () => {
        const problem = passwordProblem(password, email);
        if (problem) throw problem;
        const { error } = await cloud!.auth.signUp({ email, password, options: { captchaToken, emailRedirectTo: appUrl() } });
        if (error && error.code !== 'user_already_exists') throw error;
        // Même message que le compte existe ou non (pas de divulgation).
        ok('Si cette adresse peut être utilisée, un email de confirmation vient d’être envoyé. Cliquez sur le lien, puis connectez-vous.');
      }),

    resetPassword: (email, captchaToken) =>
      run(async () => {
        const { error } = await cloud!.auth.resetPasswordForEmail(email, { redirectTo: appUrl(), captchaToken });
        if (error && error.status === 429) throw error;
        ok('Si un compte existe pour cette adresse, un email de réinitialisation vient d’être envoyé.');
      }),

    setNewPassword: (password) =>
      run(async () => {
        const problem = passwordProblem(password, session?.user.email ?? '');
        if (problem) throw problem;
        const { error } = await cloud!.auth.updateUser({ password });
        if (error) throw error;
        setRecovery(false);
        linkedFor.current = null;
        ok('Mot de passe modifié.');
      }),

    verifyMfa: (code) =>
      run(async () => {
        const factor = (await cloud!.auth.mfa.listFactors()).data?.totp.find((f) => f.status === 'verified');
        if (!factor) throw 'Aucun facteur 2FA trouvé.';
        const { error } = await cloud!.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
        if (error) throw error;
        setNeedMfa(false);
      }),

    startMfaEnroll: () =>
      run(async () => {
        const { data, error } = await cloud!.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Endgame Rush ${Date.now()}` });
        if (error) throw error;
        setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      }),

    confirmMfaEnroll: (code) =>
      run(async () => {
        if (!enrolling) return;
        const { error } = await cloud!.auth.mfa.challengeAndVerify({ factorId: enrolling.factorId, code: code.trim() });
        if (error) throw error;
        setEnrolling(null);
        const { data } = await cloud!.auth.mfa.listFactors();
        setTotpFactors((data?.totp ?? []).filter((f) => f.status === 'verified'));
        ok('Double authentification activée. Elle sera demandée à chaque connexion.');
      }),

    cancelMfaEnroll: () =>
      run(async () => {
        if (enrolling) await cloud!.auth.mfa.unenroll({ factorId: enrolling.factorId });
        setEnrolling(null);
      }),

    disableMfa: (factorId) =>
      run(async () => {
        const { error } = await cloud!.auth.mfa.unenroll({ factorId });
        if (error) throw error;
        setTotpFactors((f) => f.filter((x) => x.id !== factorId));
        ok('Double authentification désactivée.');
      }),

    syncNow: () =>
      run(async () => {
        if (!playerId || !linkedUser(playerId)) throw 'Ce profil n’est pas lié au compte.';
        const added = await syncProfile(playerId);
        ok(added ? `Synchronisé : ${added} entrée(s) récupérée(s).` : 'Synchronisé.');
      }),

    signOut: (everywhere) =>
      run(async () => {
        await cloud!.auth.signOut({ scope: everywhere ? 'global' : 'local' });
        ok(everywhere ? 'Déconnecté de tous les appareils.' : 'Déconnecté. Le profil reste disponible hors ligne sur cet appareil.');
      }),

    deleteAccount: (confirmEmail) =>
      run(async () => {
        if (!session?.user.email || confirmEmail.trim().toLowerCase() !== session.user.email.toLowerCase())
          throw 'L’email saisi ne correspond pas au compte.';
        const { error } = await cloud!.rpc('delete_my_account');
        if (error) throw error;
        const pid = playerOfUser(session.user.id);
        if (pid) unlinkPlayer(pid);
        await cloud!.auth.signOut({ scope: 'local' });
        ok('Compte en ligne et données en ligne supprimés. Le profil local reste sur cet appareil.');
      }),

    unlinkProfile: () =>
      run(async () => {
        if (playerId) unlinkPlayer(playerId);
        await cloud!.auth.signOut({ scope: 'local' });
        setPending(0);
        ok('Profil délié et déconnecté sur cet appareil (les données en ligne sont conservées).');
      }),
  };
}
