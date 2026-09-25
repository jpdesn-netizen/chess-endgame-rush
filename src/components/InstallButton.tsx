// Bouton « Installer l'appli » (application web installable).
//  - Chrome, Edge, Samsung Internet… : l'évènement beforeinstallprompt permet
//    d'ouvrir la fenêtre d'installation du navigateur depuis un bouton.
//  - iPhone / iPad : Apple ne le permet pas ; on explique la manipulation Safari.
//  - Déjà installée (ouverte en plein écran) : rien n'est affiché.

import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// L'évènement peut arriver avant l'affichage du bouton : on le garde dès le chargement.
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function InstallButton() {
  const [, refresh] = useState(0);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const l = () => refresh((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  if (isStandalone()) return null;

  if (deferred) {
    return (
      <button
        type="button"
        onClick={async () => {
          const ev = deferred;
          if (!ev) return;
          await ev.prompt();
          await ev.userChoice;
          deferred = null;
          refresh((n) => n + 1);
        }}
        className="rounded-lg bg-stone-800 px-3 py-2 text-sm font-semibold text-stone-100 hover:bg-stone-700"
        title="Installer Chess Endgame Rush sur cet appareil"
      >
        📲 Installer l’appli
      </button>
    );
  }

  if (isIos()) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setHelp((v) => !v)}
          className="rounded-lg bg-stone-800 px-3 py-2 text-sm font-semibold text-stone-100 hover:bg-stone-700"
        >
          📲 Installer l’appli
        </button>
        {help && (
          <p className="absolute right-0 z-10 mt-2 w-64 rounded-lg bg-stone-950 p-3 text-xs text-stone-200 shadow-lg ring-1 ring-stone-700">
            Dans <strong>Safari</strong> : touchez <strong>Partager</strong> (carré avec une flèche vers le haut), faites défiler, puis{' '}
            <strong>« Sur l’écran d’accueil »</strong>.
          </p>
        )}
      </div>
    );
  }

  return null; // navigateur sans installation possible depuis la page (menu du navigateur)
}
