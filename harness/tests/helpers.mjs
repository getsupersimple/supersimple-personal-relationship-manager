// Shared test setup. Source files are the real extension modules, imported unmodified.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { pathToFileURL } from 'node:url';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXT = resolve(dirname(fileURLToPath(import.meta.url)), '../../chrome-extension');
export const extUrl = (p) => pathToFileURL(join(EXT, p)).href;

/** Replace the global IndexedDB with an empty one. */
export function freshIndexedDB() {
  globalThis.IDBKeyRange = IDBKeyRange; // storage.js uses it for the factoids index cursor
  globalThis.indexedDB = new IDBFactory();
  return globalThis.indexedDB;
}

/** The extension logs heavily with console.log; silence it so test output stays readable. */
export function quietLogs() {
  const orig = console.log;
  console.log = () => {};
  return () => {
    console.log = orig;
  };
}

let n = 0;
/** A storage module instance with its own cached DB handle (needed when a test swaps the global IndexedDB). */
export async function importFreshStorage() {
  const { storage } = await import(`${extUrl('lib/storage.js')}?instance=${++n}`);
  return storage;
}

/** Promise wrappers for raw IDB, used to build fixtures the extension itself no longer creates. */
export const idb = {
  open(name, version, upgrade) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = () => upgrade?.(req.result);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  put(db, store, row) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(row);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },
};

/** In-memory chrome.storage.local (get/set/remove with string | string[] | null keys) for service-worker code. */
export function installChromeStorageStub(initial = {}) {
  const data = { ...initial };
  const pick = (keys) => {
    if (keys == null) return { ...data };
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, data[k]]));
  };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (keys) => pick(keys),
        set: async (obj) => void Object.assign(data, obj),
        remove: async (keys) => void (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete data[k]),
      },
    },
  };
  return data;
}
