// Case anti-robot Cloudflare Turnstile (facultative : seulement si une clé de
// site est configurée ET la protection CAPTCHA activée dans Supabase).

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; 'expired-callback': () => void; theme: string; language: string }): string;
      reset(id: string): void;
      remove(id: string): void;
    };
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Anti-robot indisponible'));
    document.head.appendChild(s);
  });
  return loading;
}

export function Turnstile({ siteKey, onToken, resetSignal }: { siteKey: string; onToken: (t: string | undefined) => void; resetSignal: number }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void load().then(() => {
      if (cancelled || !box.current || !window.turnstile) return;
      id.current = window.turnstile.render(box.current, {
        sitekey: siteKey,
        callback: (t) => onToken(t),
        'expired-callback': () => onToken(undefined),
        theme: 'dark',
        language: 'fr',
      });
    });
    return () => {
      cancelled = true;
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, [siteKey, onToken]);

  // Un jeton ne sert qu'une fois : on en redemande un après chaque envoi.
  useEffect(() => {
    if (resetSignal && id.current) {
      window.turnstile?.reset(id.current);
      onToken(undefined);
    }
  }, [resetSignal, onToken]);

  return <div ref={box} className="min-h-[65px]" />;
}
