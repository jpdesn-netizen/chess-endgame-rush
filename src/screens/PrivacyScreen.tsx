// Page « Données personnelles » (RGPD) et licence / code source.
// Texte volontairement simple ; à relire par l'éditeur du site avant diffusion large.

import type { ReactNode } from 'react';

const CONTACT = import.meta.env.VITE_CONTACT_EMAIL || '';
export const SOURCE_URL = import.meta.env.VITE_SOURCE_URL || '';
const UPDATED = '26 septembre 2026';

export function PrivacyScreen({ onHome }: { onHome: () => void }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 text-sm leading-relaxed text-stone-300">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-stone-50">🔒 Données personnelles</h1>
        <button type="button" onClick={onHome} className="text-sm text-stone-400 hover:text-stone-100">
          ← Accueil
        </button>
      </div>
      <p className="text-stone-400">Dernière mise à jour : {UPDATED}.</p>

      <Section title="En résumé">
        <ul className="list-disc space-y-1 pl-5">
          <li>Sans compte, vos parties restent dans votre navigateur : rien n’est envoyé à nos serveurs.</li>
          <li>Avec un compte, nous conservons votre email, votre pseudo et votre historique d’entraînement, uniquement pour les retrouver sur vos appareils.</li>
          <li>Aucune publicité, aucune revente, aucune mesure d’audience, aucun cookie publicitaire.</li>
          <li>Classement public : uniquement si vous l’activez, sous un pseudo.</li>
          <li>Vous pouvez supprimer votre compte et toutes ses données à tout moment, depuis l’appli.</li>
        </ul>
      </Section>

      <Section title="Responsable et contact">
        <p>
          Le site est édité à titre non commercial par un particulier, membre d’un club d’échecs.{' '}
          {CONTACT ? (
            <>
              Contact : <a className="text-sky-400 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
            </>
          ) : (
            <>Contact : utilisez l’adresse d’expéditeur des emails du site.</>
          )}
        </p>
      </Section>

      <Section title="Sans compte">
        <p>
          Les profils joueurs, l’historique et les réglages sont enregistrés dans le <strong>stockage local de votre navigateur</strong>, sur
          votre appareil. Ils s’effacent avec « Supprimer ce joueur » ou en effaçant les données du site dans votre navigateur.
        </p>
        <p>
          Pour juger vos coups, la <strong>position d’échecs</strong> jouée est envoyée à la table de finales de Lichess
          (tablebase.lichess.ovh). Aucune donnée vous concernant n’y est jointe ; comme pour toute page web, ce service voit
          l’adresse IP de votre connexion.
        </p>
      </Section>

      <Section title="Avec un compte en ligne">
        <p>Données conservées :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>votre <strong>adresse email</strong> (connexion, confirmation, mot de passe oublié) ;</li>
          <li>votre <strong>mot de passe</strong>, jamais stocké en clair (seule une empreinte chiffrée est conservée) ;</li>
          <li>votre <strong>pseudo</strong> ;</li>
          <li>votre <strong>historique d’entraînement</strong> : exercices tentés, réussite, difficulté, scores Storm et Streak ;</li>
          <li>si vous l’activez, les données techniques de la <strong>double authentification</strong>.</li>
        </ul>
        <p>
          Finalité : vous permettre de retrouver votre progression sur plusieurs appareils. Ces données sont traitées parce que vous
          avez choisi de créer un compte (exécution du service demandé). Elles ne sont ni vendues, ni utilisées à des fins
          publicitaires, ni visibles par les autres joueurs, sauf si vous participez au classement (ci-dessous).
        </p>
      </Section>

      <Section title="Classement public (facultatif)">
        <p>
          Seulement si vous le choisissez (« Apparaître dans le classement », écran 📈) : votre <strong>pseudo</strong> et des
          résultats calculés à partir de votre historique (Elo, record Storm, puzzles réussis sur 7 jours) sont visibles par
          tous les visiteurs du site. Ni votre email ni l’identifiant de votre compte ne sont publiés. Base : votre
          consentement, que vous pouvez retirer à tout moment (« Me retirer du classement ») ; le classement est mis à jour
          sous 5 minutes.
        </p>
      </Section>

      <Section title="Prestataires techniques">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase</strong> : base de données et comptes. Le projet est hébergé dans une région de l’Union européenne ;
            Supabase Inc. est une société américaine.
          </li>
          <li>
            <strong>Brevo</strong> (société française) : envoi des emails de connexion.
          </li>
          <li>
            <strong>Cloudflare</strong> : hébergement du site (et vérification anti-robot si elle est activée) ; Cloudflare Inc. est
            une société américaine.
          </li>
        </ul>
      </Section>

      <Section title="Durée de conservation">
        <p>
          Jusqu’à la suppression de votre compte. « Supprimer mon compte en ligne » (écran 📈) efface immédiatement et
          définitivement le compte et ses données ; les sauvegardes techniques du prestataire peuvent en garder une copie pendant
          une durée limitée.
        </p>
      </Section>

      <Section title="Vos droits">
        <p>
          Vous pouvez accéder à vos données et les récupérer (« Exporter la sauvegarde »), les effacer (suppression du profil ou du
          compte), et demander leur rectification ou vous opposer à leur traitement en écrivant au contact ci-dessus. Vous pouvez
          aussi adresser une réclamation à la CNIL (
          <a className="text-sky-400 hover:underline" href="https://www.cnil.fr" target="_blank" rel="noreferrer">
            cnil.fr
          </a>
          ).
        </p>
      </Section>

      <Section title="Cookies et stockage">
        <p>
          Pas de cookie publicitaire ni de mesure d’audience. Le site n’utilise que le stockage nécessaire à son fonctionnement
          (profils, session de connexion, réglage du son).
        </p>
      </Section>

      <Section title="Sécurité">
        <p>
          Connexion chiffrée (HTTPS), accès aux données limité à leur propriétaire par des règles côté serveur, double
          authentification proposée, protections du navigateur (politique de sécurité du contenu).
        </p>
      </Section>

      <Section title="Licence et code source">
        <p>
          Ce logiciel est libre, sous licence <strong>GNU GPL v3</strong> (il intègre le moteur Stockfish, lui-même sous GPL v3).{' '}
          {SOURCE_URL ? (
            <>
              Code source :{' '}
              <a className="text-sky-400 hover:underline" href={SOURCE_URL} target="_blank" rel="noreferrer">
                {SOURCE_URL}
              </a>
              .
            </>
          ) : (
            <>Le code source est disponible sur simple demande au contact ci-dessus.</>
          )}{' '}
          Positions : base de puzzles Lichess (licence CC0). Échiquier : chessground (Lichess, GPL v3).
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-stone-800/60 p-4">
      <h2 className="text-base font-bold text-stone-50">{title}</h2>
      {children}
    </section>
  );
}
