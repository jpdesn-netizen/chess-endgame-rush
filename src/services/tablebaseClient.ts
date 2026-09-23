// Accès à la table de finales Lichess, avec cache et nouvelles tentatives.
// Le cache garde la PROMESSE : deux demandes simultanées pour la même
// position ne font qu'un seul appel réseau (utile pour le préchargement).

import { CONFIG } from '../core/config';
import { countPieces } from '../core/fen';
import type { TbPosition } from '../core/judge/tablebaseTypes';

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

export interface TablebaseClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  retries?: number;
  retryDelayMs?: number;
  maxPieces?: number;
}

export interface TablebaseClient {
  lookup(fen: string): Promise<TbPosition>;
  /** Lance la requête en arrière-plan (erreurs ignorées). */
  prefetch(fen: string): void;
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
        // Consigne Lichess : attendre une minute avant de réessayer.
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

  function lookup(fen: string): Promise<TbPosition> {
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
    const promise = fetchOnce(fen);
    cache.set(fen, promise);
    // En cas d'échec, on retire l'entrée pour pouvoir réessayer plus tard.
    promise.catch(() => cache.delete(fen));
    return promise;
  }

  return {
    lookup,
    prefetch(fen) {
      lookup(fen).catch(() => undefined);
    },
    stats: () => ({ requests, cacheHits, lastLatencyMs }),
  };
}

/** Instance partagée par l'application. */
export const tablebase = createTablebaseClient();
