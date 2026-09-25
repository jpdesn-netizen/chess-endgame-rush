// Accès à la table de finales Lichess, avec cache et nouvelles tentatives.
// Le cache garde la PROMESSE : deux demandes simultanées pour la même
// position ne font qu'un seul appel réseau (utile pour le préchargement).
//
// Respect des consignes de l'API Lichess (« Only make one request at a time.
// If you receive an HTTP response with a 429 status, please wait a full minute ») :
//  - une seule requête réseau à la fois (file d'attente ; le joueur passe avant
//    le préchargement) ;
//  - après un 429, plus aucune requête pendant une minute ;
//  - cache durable (IndexedDB) : une position déjà vue ne coûte plus de requête.

import { CONFIG } from '../core/config';
import { countPieces } from '../core/fen';
import type { TbPosition } from '../core/judge/tablebaseTypes';
import { createIdbCache } from './tbPersistentCache';

export type TablebaseErrorKind = 'too-many-pieces' | 'rate-limited' | 'network' | 'server' | 'bad-request';

export class TablebaseError extends Error {
  constructor(
    public readonly kind: TablebaseErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'TablebaseError';
  }
}

/** Cache durable (ex. IndexedDB) ; facultatif. */
export interface PersistentCache {
  get(fen: string): Promise<TbPosition | undefined>;
  set(fen: string, position: TbPosition): void;
}

export interface TablebaseClientOptions {
  persistent?: PersistentCache;
  /** Pause après un 429 (ms) : une minute selon Lichess. */
  rateLimitPauseMs?: number;
  now?: () => number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  retries?: number;
  retryDelayMs?: number;
  maxPieces?: number;
}

export interface TablebaseClient {
  lookup(fen: string): Promise<TbPosition>;
  /** Lance la requête en arrière-plan (erreurs ignorées, priorité basse). */
  prefetch(fen: string): void;
  /** Vrai pendant la pause imposée après un 429. */
  paused(): boolean;
  /** Statistiques pour mesurer la latence réelle. */
  stats(): { requests: number; cacheHits: number; lastLatencyMs: number | null };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createTablebaseClient(options: TablebaseClientOptions = {}): TablebaseClient {
  const baseUrl = options.baseUrl ?? CONFIG.tablebase.url;
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const retries = options.retries ?? CONFIG.tablebase.retries;
  const retryDelayMs = options.retryDelayMs ?? CONFIG.tablebase.retryDelayMs;
  const maxPieces = options.maxPieces ?? CONFIG.tablebase.maxPieces;
  const persistent = options.persistent;
  const pauseMs = options.rateLimitPauseMs ?? 60_000;
  const now = options.now ?? (() => Date.now());
  let pausedUntil = 0;

  // File d'attente : une seule requête réseau à la fois, le joueur d'abord.
  type Job = { run: () => Promise<void>; urgent: boolean };
  const queue: Job[] = [];
  let busy = false;
  const pump = () => {
    if (busy) return;
    const i = queue.findIndex((j) => j.urgent);
    const job = queue.splice(i >= 0 ? i : 0, 1)[0];
    if (!job) return;
    busy = true;
    void job.run().finally(() => {
      busy = false;
      pump();
    });
  };
  const enqueue = <T,>(fn: () => Promise<T>, urgent: boolean) =>
    new Promise<T>((resolve, reject) => {
      queue.push({ urgent, run: () => fn().then(resolve, reject) });
      pump();
    });

  const cache = new Map<string, Promise<TbPosition>>();
  let requests = 0;
  let cacheHits = 0;
  let lastLatencyMs: number | null = null;

  async function fetchOnce(fen: string): Promise<TbPosition> {
    const url = `${baseUrl}?fen=${encodeURIComponent(fen)}`;
    let attempt = 0;
    for (;;) {
      const started = performance.now();
      let response: Response;
      try {
        requests += 1;
        response = await fetchImpl(url);
      } catch {
        if (attempt < retries) {
          attempt += 1;
          await sleep(retryDelayMs * attempt);
          continue;
        }
        throw new TablebaseError('network', 'Table de finales injoignable (connexion Internet ?).');
      }
      if (response.ok) {
        const data = (await response.json()) as TbPosition;
        lastLatencyMs = Math.round(performance.now() - started);
        return data;
      }
      if (response.status === 429) {
        // Consigne Lichess : attendre une minute entière avant de réessayer.
        pausedUntil = now() + pauseMs;
        throw new TablebaseError('rate-limited', 'Trop de requêtes vers la table de finales : patiente une minute.');
      }
      if (response.status === 400) {
        throw new TablebaseError('bad-request', `Position refusée par la table de finales : ${fen}`);
      }
      if (attempt < retries) {
        attempt += 1;
        await sleep(retryDelayMs * attempt);
        continue;
      }
      throw new TablebaseError('server', `Erreur ${response.status} de la table de finales.`);
    }
  }

  function lookup(fen: string, urgent = true): Promise<TbPosition> {
    const cached = cache.get(fen);
    if (cached) {
      cacheHits += 1;
      return cached;
    }
    if (countPieces(fen) > maxPieces) {
      return Promise.reject(
        new TablebaseError('too-many-pieces', `Plus de ${maxPieces} pièces : hors de portée de la table de finales.`),
      );
    }
    const promise = (async () => {
      const stored = await persistent?.get(fen).catch(() => undefined);
      if (stored) {
        cacheHits += 1;
        return stored;
      }
      if (now() < pausedUntil) {
        throw new TablebaseError('rate-limited', 'Table de finales en pause (trop de requêtes) : reprise dans moins d’une minute.');
      }
      const position = await enqueue(() => {
        // La pause a pu commencer pendant l'attente dans la file.
        if (now() < pausedUntil) {
          return Promise.reject(new TablebaseError('rate-limited', 'Table de finales en pause (trop de requêtes).'));
        }
        return fetchOnce(fen);
      }, urgent);
      persistent?.set(fen, position);
      return position;
    })();
    cache.set(fen, promise);
    // En cas d'échec, on retire l'entrée pour pouvoir réessayer plus tard.
    promise.catch(() => cache.delete(fen));
    return promise;
  }

  return {
    lookup: (fen) => lookup(fen, true),
    prefetch(fen) {
      lookup(fen, false).catch(() => undefined);
    },
    paused: () => now() < pausedUntil,
    stats: () => ({ requests, cacheHits, lastLatencyMs }),
  };
}

/** Instance partagée par l'application. */
export const tablebase = createTablebaseClient({ persistent: createIdbCache() });
