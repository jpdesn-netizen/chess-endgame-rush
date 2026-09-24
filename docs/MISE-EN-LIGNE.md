# Mettre Chess Endgame Rush en ligne — pas à pas

Architecture : **site statique** (Cloudflare Pages) + **comptes et données** (Supabase).
Aucun serveur à administrer. Seule la clé *publique* Supabase est dans le site ;
la protection des données est faite **côté base** par les règles RLS
(`supabase/migrations/0001_comptes.sql`), testées par `supabase/tests/`.

---

## Étape 0 — Installer la bibliothèque des comptes (une fois)

```
cd C:\Users\jpdes\dev\chess-endgame-rush
npm install @supabase/supabase-js@2
npm test
```

## Étape 1 — Créer la base Supabase

1. Créer un compte sur https://supabase.com, puis **New project**
   - Région : **Europe** (données en UE).
   - Mot de passe de la base : long, généré, rangé dans un gestionnaire de mots de passe.
2. **SQL Editor → New query** : coller tout `supabase/migrations/0001_comptes.sql` → **Run**.
3. **Advisors → Security Advisor** : doit afficher **0 alerte**. Corriger sinon avant d'ouvrir.
4. **Project Settings → API Keys** : copier l'URL du projet et la clé **publishable** (`sb_publishable_…`).
   ⛔ Ne jamais copier la clé **secret** (`sb_secret_…`) ni `service_role` dans le site :
   l'appli refuse de démarrer si elle en détecte une.

## Étape 2 — Régler l'authentification (Authentication → …)

| Réglage | Valeur | Pourquoi |
|---|---|---|
| Sign In / Providers → Email | activé ; **Confirm email** activé ; **Secure email change** activé | pas de compte sans email vérifié |
| Autres fournisseurs, connexion anonyme | **désactivés** | surface d'attaque minimale |
| Password → longueur minimale | **12** ; exiger minuscules, majuscules, chiffres | même règle que l'appli |
| Password → Leaked password protection | activer (**offre Pro uniquement**) | bloque les mots de passe déjà divulgués |
| Multi-Factor → TOTP | **activé** | double authentification proposée aux joueurs |
| Bot and Abuse Protection → CAPTCHA | **Turnstile** + clé secrète (étape 3) | bloque les robots (création de comptes, force brute) |
| Rate Limits | laisser les valeurs par défaut ou les baisser | freine la force brute |
| URL Configuration → Site URL | `https://finales.votre-domaine.fr/` | liens des emails |
| URL Configuration → Redirect URLs | adresses **exactes**, sans joker (`*`) | empêche de détourner un lien de connexion |
| Emails → SMTP Settings | **SMTP personnalisé obligatoire** (ex. Brevo, Resend, Postmark) | le service par défaut n'envoie que 2 emails/heure et seulement aux membres de l'équipe |

## Étape 3 — Anti-robot Cloudflare Turnstile (gratuit)

1. Tableau de bord Cloudflare → **Turnstile → Add widget** ; domaines : votre domaine + `*.pages.dev` du projet.
2. **Site key** → `.env.production` (`VITE_TURNSTILE_SITEKEY`).
3. **Secret key** → Supabase (étape 2, CAPTCHA). Jamais dans le site.

## Étape 4 — Construire le site

1. Copier `.env.example` en **`.env.production`** et le remplir (URL, clé publishable, clé de site Turnstile,
   `VITE_PARENT_ORIGINS` = adresse du site du club s'il intègre l'appli en iframe).
2. Puis :
   ```
   npm ci
   npm test
   npm run audit          (0 vulnérabilité « high » ou « critical » attendue)
   npm run build
   ```
3. Vérifier que `dist\_headers` existe et que la ligne `connect-src` contient bien votre adresse Supabase.

## Étape 5 — Publier sur Cloudflare Pages

- Simple : Cloudflare → **Workers & Pages → Create application → Drag and drop** → déposer le **contenu** de `dist`.
- En ligne de commande : `npx wrangler pages deploy dist`
- (Un projet créé par dépôt direct ne peut pas passer ensuite à un déploiement depuis Git.)
- **Custom domains** → ajouter `finales.votre-domaine.fr` (HTTPS automatique).
- Ajouter cette adresse dans Supabase (Site URL + Redirect URLs) et dans Turnstile.

## Étape 6 — Vérifier AVANT d'annoncer le site

| # | Contrôle | Attendu |
|---|---|---|
| 1 | https://securityheaders.com et https://developer.mozilla.org/fr/observatory sur l'adresse du site | note A ou A+ |
| 2 | Ouvrir le site, F12 → Console, jouer un Storm, se connecter | aucune erreur « Content Security Policy » ; moteur et table de finales OK |
| 3 | Créer un compte → email reçu → confirmer → se connecter | OK ; un mauvais mot de passe donne un message neutre |
| 4 | Deux comptes A et B sur deux navigateurs | B ne voit jamais les parties de A |
| 5 | Activer la 2FA sur A, se déconnecter, se reconnecter | code demandé ; sans code, pas de données |
| 6 | « Mot de passe oublié » | email reçu, lien ramène au site, nouveau mot de passe accepté |
| 7 | « Supprimer mon compte » sur un compte de test | compte et données disparus (Supabase → Authentication → Users) |
| 8 | Security Advisor Supabase | 0 alerte |
| 9 | Intégration : page du club avec l'iframe | l'appli s'affiche ; un autre site ne peut pas l'afficher |

## Étape 7 — Intégrer dans le site du club (WordPress)

```html
<iframe src="https://finales.votre-domaine.fr/?embed=1&mode=storm&theme=tours"
        width="100%" height="820" style="border:0" allow="fullscreen"></iframe>
<script>
  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://finales.votre-domaine.fr') return; // toujours vérifier l'origine
    if (e.data?.type === 'cer:result') console.log('Score', e.data.score);
  });
</script>
```

## Ensuite, régulièrement

- Chaque mois : `npm run audit` ; mettre à jour les dépendances signalées, retester, republier.
- Supabase → **Authentication → Users / Logs** : repérer les créations de comptes en rafale.
- Offre gratuite : le projet est **mis en pause après 1 semaine sans activité** ; 500 Mo de base.
- Clé exposée par erreur ? Supabase → API Keys → **régénérer**, puis reconstruire le site.
- Licence : Stockfish est sous GPL v3 → le code source du site doit être accessible (ex. dépôt public + lien dans l'appli).
- RGPD : ajouter une page « Données personnelles » (email, pseudo, parties ; finalité ; suppression dans l'appli ;
  contact). Pour les membres mineurs, se référer aux recommandations de la CNIL.

## Limites connues (honnêtement)

- Les scores sont calculés dans le navigateur : un joueur technique peut falsifier **ses propres** scores.
  Sans classement public, aucun impact sur les autres. Un classement public nécessiterait une validation côté serveur.
- La session de connexion est gardée dans le navigateur (fonctionnement standard de Supabase) ; la politique
  de sécurité du contenu (CSP) stricte limite fortement le risque de vol par script malveillant.
- Sans offre Pro Supabase, pas de blocage des mots de passe déjà divulgués : la 2FA compense.
