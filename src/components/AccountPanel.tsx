// Compte en ligne : connexion, création, mot de passe oublié, double
// authentification (TOTP), synchronisation, déconnexion, suppression.

import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import type { CloudAccount } from '../hooks/useCloudAccount';
import { turnstileSiteKey } from '../services/cloud';
import { linkedUser } from '../services/sync';
import { Turnstile } from './Turnstile';

const input = 'w-full rounded-lg bg-stone-900 px-3 py-2 text-stone-100 placeholder:text-stone-500';
const primary = 'rounded-lg bg-amber-500 px-4 py-2 font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-50';
const secondary = 'rounded-lg bg-stone-700 px-3 py-1.5 text-sm text-stone-100 hover:bg-stone-600 disabled:opacity-50';
const link = 'text-sm text-sky-400 hover:underline';

export function AccountPanel({ account, playerId, playerName }: { account: CloudAccount; playerId: string | null; playerName: string | null }) {
  const [tab, setTab] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [captcha, setCaptcha] = useState<string | undefined>();
  const [captchaReset, setCaptchaReset] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const onToken = useCallback((t: string | undefined) => setCaptcha(t), []);
  const a = account;

  if (!a.enabled) {
    return (
      <Box>
        <p className="text-sm text-stone-400">
          Comptes en ligne non configurés sur ce site : les profils restent enregistrés dans ce navigateur.
        </p>
      </Box>
    );
  }

  const submit = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    await fn();
    setPassword('');
    setCode('');
    setCaptchaReset((n) => n + 1);
  };
  const needCaptcha = !!turnstileSiteKey && !captcha;
  const msg = a.message && (
    <p role="status" className={`text-sm ${a.message.tone === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
      {a.message.text}
    </p>
  );

  // 1. Retour par le lien « mot de passe oublié »
  if (a.session && a.recovery) {
    return (
      <Box>
        <form className="flex flex-col gap-2" onSubmit={submit(() => a.setNewPassword(password))}>
          <label className="text-sm text-stone-300" htmlFor="newpw">
            Nouveau mot de passe (12 caractères min., majuscules, minuscules, chiffres)
          </label>
          <PasswordBox show={showPw} onToggle={() => setShowPw((v) => !v)}>
            <input id="newpw" type={showPw ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="new-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} maxLength={72} />
          </PasswordBox>
          <button type="submit" className={primary} disabled={a.busy}>
            Enregistrer
          </button>
        </form>
        {msg}
      </Box>
    );
  }

  // 2. Mot de passe correct, code 2FA attendu
  if (a.session && a.needMfa) {
    return (
      <Box>
        <form className="flex flex-col gap-2" onSubmit={submit(() => a.verifyMfa(code))}>
          <label className="text-sm text-stone-300" htmlFor="mfa">
            Code à 6 chiffres de votre application d’authentification
          </label>
          <input id="mfa" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} className={input} value={code} onChange={(e) => setCode(e.target.value)} required />
          <div className="flex gap-2">
            <button type="submit" className={primary} disabled={a.busy}>
              Valider
            </button>
            <button type="button" className={secondary} onClick={() => a.signOut(false)}>
              Annuler
            </button>
          </div>
        </form>
        {msg}
      </Box>
    );
  }

  // 3. Connecté
  if (a.session) {
    const linked = playerId ? linkedUser(playerId) === a.session.user.id : false;
    return (
      <Box>
        <p className="text-sm text-stone-200">
          ☁ Connecté : <strong>{a.email}</strong>
          {linked && playerName && <> · profil lié : <strong>{playerName}</strong></>}
        </p>
        <p className="text-xs text-stone-400">
          {a.pending ? `${a.pending} entrée(s) en attente d’envoi. ` : 'Tout est envoyé. '}
          {a.lastSync && `Dernière synchronisation : ${new Date(a.lastSync).toLocaleTimeString('fr-FR')}.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} disabled={a.busy} onClick={() => a.syncNow()}>
            ⟳ Synchroniser
          </button>
          <button type="button" className={secondary} disabled={a.busy} onClick={() => a.signOut(false)}>
            Se déconnecter
          </button>
          <button type="button" className={secondary} disabled={a.busy} onClick={() => a.signOut(true)}>
            Déconnecter tous les appareils
          </button>
        </div>

        <details className="rounded-lg bg-stone-900/60 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-stone-200">
            🔐 Double authentification {a.totpFactors.length ? '(activée)' : '(recommandée)'}
          </summary>
          <div className="mt-2 flex flex-col gap-2 text-sm text-stone-300">
            {a.totpFactors.map((f) => (
              <div key={f.id} className="flex items-center gap-2">
                ✅ Application d’authentification active
                <button type="button" className={secondary} disabled={a.busy} onClick={() => a.disableMfa(f.id)}>
                  Désactiver
                </button>
              </div>
            ))}
            {!a.totpFactors.length && !a.enrolling && (
              <>
                <p>Protège le compte même si le mot de passe est volé : un code de votre téléphone sera demandé à chaque connexion.</p>
                <button type="button" className={primary} disabled={a.busy} onClick={() => a.startMfaEnroll()}>
                  Activer
                </button>
              </>
            )}
            {a.enrolling && (
              <form className="flex flex-col gap-2" onSubmit={submit(() => a.confirmMfaEnroll(code))}>
                <p>1. Scannez ce QR code avec une application (Google Authenticator, Microsoft Authenticator, 2FAS, Aegis…).</p>
                <img src={a.enrolling.qr} alt="QR code de la double authentification" className="h-44 w-44 rounded bg-white p-2" />
                <p className="text-xs text-stone-400">
                  Ou saisissez la clé : <code className="select-all break-all">{a.enrolling.secret}</code>
                </p>
                <label htmlFor="enroll">2. Entrez le code affiché :</label>
                <input id="enroll" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} className={input} value={code} onChange={(e) => setCode(e.target.value)} required />
                <div className="flex gap-2">
                  <button type="submit" className={primary} disabled={a.busy}>
                    Confirmer
                  </button>
                  <button type="button" className={secondary} onClick={() => a.cancelMfaEnroll()}>
                    Annuler
                  </button>
                </div>
              </form>
            )}
          </div>
        </details>

        <details className="rounded-lg bg-stone-900/60 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-stone-200">Gérer le compte</summary>
          <div className="mt-2 flex flex-col gap-2 text-sm text-stone-300">
            <button type="button" className={`${secondary} self-start`} disabled={a.busy} onClick={() => a.unlinkProfile()}>
              Délier ce profil du compte
            </button>
            {confirmDelete === null ? (
              <button type="button" className="self-start text-sm text-red-400 hover:underline" onClick={() => setConfirmDelete('')}>
                🗑 Supprimer mon compte en ligne…
              </button>
            ) : (
              <form className="flex flex-col gap-2" onSubmit={submit(() => a.deleteAccount(confirmDelete))}>
                <label htmlFor="del">
                  Suppression <strong>définitive</strong> du compte et de ses données en ligne. Tapez votre email pour confirmer :
                </label>
                <input id="del" type="email" autoComplete="off" className={input} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} required />
                <div className="flex gap-2">
                  <button type="submit" className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-500 disabled:opacity-50" disabled={a.busy}>
                    Supprimer définitivement
                  </button>
                  <button type="button" className={secondary} onClick={() => setConfirmDelete(null)}>
                    Annuler
                  </button>
                </div>
              </form>
            )}
          </div>
        </details>
        {msg}
      </Box>
    );
  }

  // 4. Déconnecté
  return (
    <Box>
      <div className="flex gap-2">
        {(
          [
            ['login', 'Connexion'],
            ['signup', 'Créer un compte'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${tab === id ? 'bg-amber-500 text-stone-900' : 'bg-stone-800 text-stone-200'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={submit(() =>
          tab === 'login' ? a.signIn(email, password, captcha) : tab === 'signup' ? a.signUp(email, password, captcha) : a.resetPassword(email, captcha),
        )}
      >
        <input type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
        {tab !== 'reset' && (
          <PasswordBox show={showPw} onToggle={() => setShowPw((v) => !v)}>
          <input
            type={showPw ? 'text' : 'password'}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
            placeholder={tab === 'signup' ? 'Mot de passe (12 caractères min.)' : 'Mot de passe'}
            className={input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={tab === 'signup' ? 12 : 1}
            maxLength={72}
          />
          </PasswordBox>
        )}
        {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} onToken={onToken} resetSignal={captchaReset} />}
        <button type="submit" className={primary} disabled={a.busy || needCaptcha}>
          {tab === 'login' ? 'Se connecter' : tab === 'signup' ? 'Créer le compte' : 'Recevoir le lien'}
        </button>
      </form>
      <button type="button" className={`${link} self-start`} onClick={() => setTab(tab === 'reset' ? 'login' : 'reset')}>
        {tab === 'reset' ? '← Retour à la connexion' : 'Mot de passe oublié ?'}
      </button>
      {tab === 'signup' && (
        <p className="text-xs text-stone-500">
          À la connexion, le profil sélectionné et tout son historique sont envoyés sur le compte, puis retrouvés sur vos autres
          appareils. Données conservées : email, pseudo, puzzles et parties. Aucun autre usage.
        </p>
      )}
      {msg}
    </Box>
  );
}

/** Champ mot de passe avec bouton pour l'afficher (utile sur téléphone). */
function PasswordBox({ show, onToggle, children }: { show: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <button
        type="button"
        onClick={onToggle}
        className="absolute inset-y-0 right-2 px-2 text-sm text-stone-400 hover:text-stone-100"
        aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        title={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        {show ? '🙈' : '👁'}
      </button>
    </div>
  );
}

function Box({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-stone-700 p-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-400">Compte en ligne</h3>
      {children}
    </div>
  );
}
