// Client du moteur Stockfish (version WebAssembly « lite », un seul thread)
// exécuté dans un Web Worker, via le protocole UCI.
// Les fichiers du moteur sont copiés dans public/stockfish/ par
// scripts/copy-stockfish.mjs (lancé automatiquement par npm install).

import type { EngineScore } from '../core/judge/engineJudge';

export interface Analysis {
  bestmove: string | null;
  score: EngineScore;
  pv: string[];
}

interface Job {
  fen: string;
  movetimeMs: number;
  resolve: (a: Analysis) => void;
  reject: (e: Error) => void;
}

export interface Engine {
  analyse(fen: string, movetimeMs: number): Promise<Analysis>;
  /** Analyse en arrière-plan, résultat mis en cache. */
  prefetch(fen: string, movetimeMs: number): void;
  ready(): Promise<void>;
}

export function createStockfish(scriptUrl: string): Engine {
  let worker: Worker | null = null;
  let readyPromise: Promise<void> | null = null;
  const queue: Job[] = [];
  let current: Job | null = null;
  let lastInfo: { score: EngineScore; pv: string[] } = { score: { cp: 0 }, pv: [] };
  const cache = new Map<string, Promise<Analysis>>();

  function start(): Promise<void> {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise<void>((resolve, reject) => {
      try {
        worker = new Worker(scriptUrl);
      } catch {
        reject(new Error(`Moteur Stockfish introuvable (${scriptUrl}).`));
        return;
      }
      const timeout = window.setTimeout(() => reject(new Error('Le moteur Stockfish ne répond pas.')), 15_000);
      worker.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Échec du chargement du moteur Stockfish.'));
      };
      worker.onmessage = (event: MessageEvent) => {
        const line = String(event.data);
        if (line === 'readyok' && !current) {
          window.clearTimeout(timeout);
          resolve();
          return;
        }
        onLine(line);
      };
      worker.postMessage('uci');
      worker.postMessage('setoption name Hash value 32');
      worker.postMessage('isready');
    });
    readyPromise.catch(() => {
      readyPromise = null;
    });
    return readyPromise;
  }

  function onLine(line: string) {
    if (!current) return;
    if (line.startsWith('info') && line.includes(' pv ')) {
      const mate = line.match(/score mate (-?\d+)/);
      const cp = line.match(/score cp (-?\d+)/);
      const pv = line.split(' pv ')[1]?.trim().split(/\s+/) ?? [];
      if (mate) lastInfo = { score: { mate: Number(mate[1]) }, pv };
      else if (cp) lastInfo = { score: { cp: Number(cp[1]) }, pv };
    } else if (line.startsWith('bestmove')) {
      const move = line.split(/\s+/)[1];
      const job = current;
      current = null;
      job.resolve({ bestmove: move && move !== '(none)' ? move : null, score: lastInfo.score, pv: lastInfo.pv });
      next();
    }
  }

  function next() {
    if (current || queue.length === 0 || !worker) return;
    current = queue.shift()!;
    lastInfo = { score: { cp: 0 }, pv: [] };
    worker.postMessage(`position fen ${current.fen}`);
    worker.postMessage(`go movetime ${current.movetimeMs}`);
  }

  function analyse(fen: string, movetimeMs: number): Promise<Analysis> {
    const key = `${fen}|${movetimeMs}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const promise = start().then(
      () =>
        new Promise<Analysis>((resolve, reject) => {
          queue.push({ fen, movetimeMs, resolve, reject });
          next();
        }),
    );
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
    return promise;
  }

  return {
    analyse,
    prefetch(fen, movetimeMs) {
      analyse(fen, movetimeMs).catch(() => undefined);
    },
    ready: start,
  };
}

/** Instance partagée, chargée à la première utilisation. */
export const stockfish = createStockfish(`${import.meta.env.BASE_URL}stockfish/stockfish.js`);
