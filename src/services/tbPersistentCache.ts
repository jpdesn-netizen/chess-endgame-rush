// Cache durable des réponses de la table de finales (IndexedDB du navigateur).
// Une position déjà analysée ne coûte plus de requête à Lichess, même après
// fermeture de l'onglet. Sans IndexedDB (navigation privée…), cache inactif.

import type { TbPosition } from '../core/judge/tablebaseTypes';
import type { PersistentCache } from './tablebaseClient';

const DB = 'endgameRush-tablebase';
const STORE = 'positions';
const MAX_ENTRIES = 5000; // ~ 10 à 20 Mo au plus
const PRUNE_EVERY = 200;

export function createIdbCache(): PersistentCache | undefined {
  if (typeof indexedDB === 'undefined') return undefined;
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () =>
    (dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE);
        store.createIndex('t', 't');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  let writes = 0;

  const prune = async () => {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const count = await new Promise<number>((res, rej) => {
      const r = store.count();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    let excess = count - MAX_ENTRIES;
    if (excess <= 0) return;
    const cursorReq = store.index('t').openCursor(); // du plus ancien au plus récent
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor || excess <= 0) return;
      cursor.delete();
      excess -= 1;
      cursor.continue();
    };
  };

  return {
    async get(fen) {
      const db = await open();
      return new Promise<TbPosition | undefined>((resolve) => {
        const req = db.transaction(STORE).objectStore(STORE).get(fen);
        req.onsuccess = () => resolve((req.result as { pos: TbPosition } | undefined)?.pos);
        req.onerror = () => resolve(undefined);
      });
    },
    set(fen, pos) {
      void open()
        .then((db) => {
          db.transaction(STORE, 'readwrite').objectStore(STORE).put({ pos, t: Date.now() }, fen);
          writes += 1;
          if (writes % PRUNE_EVERY === 0) void prune();
        })
        .catch(() => undefined);
    },
  };
}
