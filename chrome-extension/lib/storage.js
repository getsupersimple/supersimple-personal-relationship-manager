/**
 * IndexedDB storage layer for Supersimple Personal Relationship Manager
 * Uses native IndexedDB API (no external deps)
 *
 * To inspect: Open the Contacts or Settings page, then Inspect → Application → IndexedDB → prm-contacts
 */
import { mergeContacts } from './dedup.js';

const DB_NAME = 'prm-contacts';
const LEGACY_DB_NAME = 'prm-rolodex';
const DB_VERSION = 2;

const STORAGE_LOG = (...args) => {
  const ctx = typeof window === 'undefined' ? '[SW]' : '[Page]';
  console.log('[PRM storage]', ctx, ...args);
};

/** @param {IDBDatabase} database */
function ensureStores(database) {
  if (!database.objectStoreNames.contains('contacts')) {
    database.createObjectStore('contacts', { keyPath: 'id' });
    STORAGE_LOG('ensureStores: created contacts store');
  }
  if (!database.objectStoreNames.contains('conversations')) {
    database.createObjectStore('conversations', { keyPath: 'id' });
    STORAGE_LOG('ensureStores: created conversations store');
  }
  if (!database.objectStoreNames.contains('syncState')) {
    database.createObjectStore('syncState', { keyPath: 'id' });
    STORAGE_LOG('ensureStores: created syncState store');
  }
  if (!database.objectStoreNames.contains('factoids')) {
    const factoidStore = database.createObjectStore('factoids', { keyPath: 'id' });
    factoidStore.createIndex('byContactId', 'contactId', { unique: false });
    STORAGE_LOG('ensureStores: created factoids store');
  }
}

/**
 * One-time copy of every store from the pre-rename 'prm-rolodex' database into 'prm-contacts',
 * then deletes the old one. Safe to call more than once (or from multiple contexts at once) —
 * it's a no-op as soon as the legacy database is gone, and store writes are idempotent puts.
 */
async function migrateLegacyDatabaseIfNeeded() {
  if (typeof indexedDB.databases !== 'function') return;
  const existing = await indexedDB.databases();
  if (!existing.some((d) => d.name === LEGACY_DB_NAME)) return;

  STORAGE_LOG('migrateLegacyDatabaseIfNeeded: found', LEGACY_DB_NAME, '— migrating to', DB_NAME);
  const legacyDb = await new Promise((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const storeNames = Array.from(legacyDb.objectStoreNames);
  const rowsByStore = {};
  for (const name of storeNames) {
    rowsByStore[name] = await new Promise((resolve, reject) => {
      const req = legacyDb.transaction(name, 'readonly').objectStore(name).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  legacyDb.close();

  const newDb = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => ensureStores(e.target.result);
  });

  if (storeNames.length > 0) {
    await new Promise((resolve, reject) => {
      const tx = newDb.transaction(storeNames, 'readwrite');
      for (const name of storeNames) {
        const s = tx.objectStore(name);
        for (const row of rowsByStore[name]) s.put(row);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  newDb.close();

  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(LEGACY_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  STORAGE_LOG(
    'migrateLegacyDatabaseIfNeeded: done, migrated',
    storeNames.map((n) => `${n}:${rowsByStore[n].length}`).join(', '),
  );
}

/** @type {IDBDatabase | null} */
let db = null;
/** @type {Promise<void> | null} */
let migrationPromise = null;

/**
 * @returns {Promise<IDBDatabase>}
 */
function getDB() {
  if (db) {
    STORAGE_LOG('getDB: using cached db');
    return Promise.resolve(db);
  }
  if (!migrationPromise) {
    migrationPromise = migrateLegacyDatabaseIfNeeded().catch((e) => {
      STORAGE_LOG('getDB: legacy migration failed (continuing with a fresh database)', e);
    });
  }
  STORAGE_LOG('getDB: opening', DB_NAME, 'v' + DB_VERSION, '| indexedDB available:', typeof indexedDB);
  return migrationPromise.then(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => {
          STORAGE_LOG('getDB: OPEN FAILED', req.error);
          reject(req.error);
        };
        req.onsuccess = () => {
          db = req.result;
          STORAGE_LOG('getDB: opened successfully, objectStores:', Array.from(db.objectStoreNames));
          resolve(db);
        };
        req.onupgradeneeded = (e) => {
          ensureStores(e.target.result);
        };
      }),
  );
}

/**
 * @param {string} store
 * @param {string} method - 'get' | 'getAll' | 'put' | 'delete' | 'clear'
 * @param {any} [keyOrValue]
 * @returns {Promise<any>}
 */
function dbOp(store, method, keyOrValue) {
  return getDB().then((database) => {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(store, method === 'get' || method === 'getAll' ? 'readonly' : 'readwrite');
      const s = tx.objectStore(store);
      let req;
      switch (method) {
        case 'get':
          req = s.get(keyOrValue);
          break;
        case 'getAll':
          req = s.getAll();
          break;
        case 'put':
          req = s.put(keyOrValue);
          break;
        case 'delete':
          req = s.delete(keyOrValue);
          break;
        case 'clear':
          req = s.clear();
          break;
        default:
          reject(new Error(`Unknown method: ${method}`));
          return;
      }
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Remove cached latest-message responses (`msgCache_<contactId>_<platform>` in chrome.storage.local, written by the
 * service worker). They hold message text, so they must not outlive the contact or network they belong to.
 * @param {{ contactId?: string, platform?: string }} [filter] - omit both to remove every entry
 */
export async function purgeLatestMessageCache({ contactId, platform } = {}) {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return 0;
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter(
    (k) =>
      k.startsWith('msgCache_') &&
      (!contactId || k.startsWith(`msgCache_${contactId}_`)) &&
      (!platform || k.endsWith(`_${platform}`)),
  );
  if (keys.length) await chrome.storage.local.remove(keys);
  return keys.length;
}

export const storage = {
  /** @param {import('../shared/types.js').Contact} contact */
  async saveContact(contact) {
    return dbOp('contacts', 'put', contact);
  },

  /**
   * @param {import('../shared/types.js').Contact[]} contacts - factoids are persisted separately; will be stripped before saving
   * @param {{ bypassShrinkGuard?: boolean }} [options] - set bypassShrinkGuard for intentional bulk deletes (e.g. clear network)
   */
  async saveContacts(contacts, options = {}) {
    const bypassShrinkGuard = options.bypassShrinkGuard === true;
    const list = Array.isArray(contacts) ? contacts : [];
    if (!list.length && !bypassShrinkGuard) return;

    if (!list.length && bypassShrinkGuard) {
      const database = await getDB();
      return new Promise((resolve, reject) => {
        const tx = database.transaction('contacts', 'readwrite');
        tx.objectStore('contacts').clear();
        tx.oncomplete = () => {
          STORAGE_LOG('saveContacts: cleared all contacts (bypassShrinkGuard)');
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    }

    const current = await this.getAllContacts();
    const currentCount = current.length;
    const newCount = list.length;
    if (!bypassShrinkGuard && currentCount >= 10 && newCount < currentCount * 0.5) {
      STORAGE_LOG('saveContacts: REFUSED – would drop from', currentCount, 'to', newCount, '(possible empty getAllContacts in sync)');
      throw new Error(
        'Save refused: contact list would shrink from ' + currentCount + ' to ' + newCount + '. ' +
        'If you did not intend to delete contacts, try syncing again.'
      );
    }
    STORAGE_LOG('saveContacts: saving', newCount, 'contacts');
    for (const c of list) {
      if (c.factoids?.length) {
        await this.saveFactoidsForContact(c.id, c.factoids);
      }
      delete c.factoids;
    }
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('contacts', 'readwrite');
      const s = tx.objectStore('contacts');
      s.clear();
      for (const c of list) {
        if (!c?.id) {
          reject(new Error('Contact missing id: ' + JSON.stringify(c).slice(0, 100)));
          return;
        }
        s.put(c);
      }
      tx.oncomplete = () => {
        STORAGE_LOG('saveContacts: done, saved', list.length);
        resolve();
      };
      tx.onerror = () => {
        STORAGE_LOG('saveContacts: FAILED', tx.error);
        reject(tx.error);
      };
    });
  },

  /**
   * Remove one network from all contacts: strip platform data, delete contacts that would have none left,
   * remove matching factoid sources and conversation rows for that platform.
   * @param {'linkedin' | 'facebook' | 'whatsapp' | 'gmail'} platform
   * @returns {Promise<{ removedContacts: number, updatedContacts: number }>}
   */
  async clearNetworkPlatform(platform) {
    const allowed = new Set(['linkedin', 'facebook', 'whatsapp', 'gmail']);
    if (!allowed.has(platform)) {
      throw new Error('Invalid platform: ' + platform);
    }
    const all = await this.getAllContacts();
    const allConvs = await this.getAllConversations();
    const conversationIdsToDelete = allConvs.filter((v) => v.platform === platform).map((v) => v.id);

    /** @type {import('../shared/types.js').Contact[]} */
    const next = [];
    /** @type {string[]} */
    const contactIdsRemoved = [];
    let updatedContacts = 0;

    for (const c of all) {
      if (!c?.platforms?.[platform]) {
        next.push(c);
        continue;
      }
      const platforms = { ...(c.platforms || {}) };
      delete platforms[platform];
      /** @type {import('../shared/types.js').Contact} */
      const out = { ...c, platforms };
      if (c.conversationSummaryPlatform === platform) {
        delete out.conversationSummary;
        delete out.conversationSummaryPlatform;
        delete out.conversationSummaryAt;
      }
      const stillHas =
        platforms.linkedin ||
        platforms.facebook ||
        platforms.whatsapp ||
        platforms.gmail ||
        (c.primaryEmail && String(c.primaryEmail).trim());
      if (!stillHas) {
        contactIdsRemoved.push(c.id);
        continue;
      }
      updatedContacts++;
      const facts = await this.getFactoidsByContactId(c.id);
      const kept = facts.filter((f) => (f.source || '') !== platform);
      await this.saveFactoidsForContact(
        c.id,
        kept.map((f) => ({ id: f.id, key: f.key, value: f.value, source: f.source })),
      );
      next.push(out);
    }

    for (const id of contactIdsRemoved) {
      await this.saveFactoidsForContact(id, []);
    }

    if (conversationIdsToDelete.length > 0) {
      const database = await getDB();
      await new Promise((resolve, reject) => {
        const tx = database.transaction('conversations', 'readwrite');
        const s = tx.objectStore('conversations');
        for (const cid of conversationIdsToDelete) s.delete(cid);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    await this.saveContacts(next, { bypassShrinkGuard: true });
    await purgeLatestMessageCache({ platform }).catch(() => {});
    STORAGE_LOG(
      'clearNetworkPlatform:',
      platform,
      'removed',
      contactIdsRemoved.length,
      'updated',
      updatedContacts,
    );
    return { removedContacts: contactIdsRemoved.length, updatedContacts };
  },

  /** Wipe every contact, factoid, and conversation across all networks. Irreversible. */
  async clearAllContacts() {
    const removedContacts = (await this.getAllContacts()).length;
    await this.saveContacts([], { bypassShrinkGuard: true });
    await dbOp('factoids', 'clear');
    await dbOp('conversations', 'clear');
    await purgeLatestMessageCache().catch(() => {});
    STORAGE_LOG('clearAllContacts: removed', removedContacts, 'contacts (all networks)');
    return { removedContacts };
  },

  /** @returns {Promise<import('../shared/types.js').Contact[]>} */
  async getAllContacts() {
    const result = await dbOp('contacts', 'getAll');
    const arr = Array.isArray(result) ? result : [];
    // One-time migration: move embedded factoids (v1) into factoids store
    const withFactoids = arr.filter((c) => c.factoids?.length);
    if (withFactoids.length > 0) {
      STORAGE_LOG('getAllContacts: migrating', withFactoids.length, 'contacts with embedded factoids');
      for (const c of withFactoids) {
        await this.saveFactoidsForContact(c.id, c.factoids);
        const { factoids: _, ...rest } = c;
        await dbOp('contacts', 'put', rest);
      }
      return arr.map((c) => (c.factoids?.length ? { ...c, factoids: undefined } : c));
    }
    STORAGE_LOG('getAllContacts: returning', arr.length, 'contacts');
    return arr;
  },

  /** @param {string} id */
  async getContact(id) {
    return dbOp('contacts', 'get', id);
  },

  /** Delete a contact row only (factoids/conversations stay keyed by this id for merge/undo). */
  async deleteContact(id) {
    if (!id) return;
    await dbOp('contacts', 'delete', id);
    await purgeLatestMessageCache({ contactId: id }).catch(() => {});
    STORAGE_LOG('deleteContact:', id);
  },

  /**
   * Merge mergeId into keepId: combine platforms, delete mergeId contact row. Factoids and
   * conversations are not moved; they stay under mergeId. View loads by keepId + platform ids.
   * @param {string} keepId - Survivor contact id
   * @param {string} mergeId - Contact to merge in (row will be deleted)
   */
  async mergeContactInto(keepId, mergeId) {
    const keep = await this.getContact(keepId);
    const merge = await this.getContact(mergeId);
    if (!keep) throw new Error('Contact not found: ' + keepId);
    if (!merge) throw new Error('Contact not found: ' + mergeId);
    const merged = mergeContacts(keep, merge);
    // Ensure each merged-in platform blob has id and name for undo
    for (const [key, blob] of Object.entries(merge.platforms || {})) {
      if (blob && merged.platforms?.[key]) {
        const prev = merged.platforms[key];
        const absorbed = (prev.absorbedIds || []).concat(prev.id && prev.id !== merge.id ? [prev.id] : []);
        const { absorbedIds: _drop, ...rest } = prev;
        merged.platforms[key] = {
          ...rest,
          id: merge.id,
          name: merge.displayName,
          ...(absorbed.length ? { absorbedIds: [...new Set(absorbed)].filter((id) => id !== merge.id) } : {}),
        };
      }
    }
    await this.saveContact(merged);
    await this.deleteContact(mergeId);
    STORAGE_LOG('mergeContactInto: merged', mergeId, 'into', keepId);
  },

  /** @param {string} email */
  async getContactByEmail(email) {
    const all = await this.getAllContacts();
    return all.find((c) => c.primaryEmail?.toLowerCase() === email?.toLowerCase());
  },

  /** @param {import('../shared/types.js').Conversation} conv */
  async saveConversation(conv) {
    return dbOp('conversations', 'put', conv);
  },

  /** @param {import('../shared/types.js').Conversation[]} convs */
  async saveConversations(convs) {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('conversations', 'readwrite');
      const s = tx.objectStore('conversations');
      for (const c of convs) s.put(c);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /** @returns {Promise<import('../shared/types.js').Conversation[]>} */
  async getAllConversations() {
    const result = await dbOp('conversations', 'getAll');
    return Array.isArray(result) ? result : [];
  },

  /** @param {string} contactId */
  async getConversationsForContact(contactId) {
    const all = await this.getAllConversations();
    return all.filter((c) => c.contactId === contactId);
  },

  /**
   * Factoids are stored separately from contacts (keyed by contactId) for privacy; only factoids can be synced to cloud.
   * @param {string} contactId
   * @returns {Promise<import('../shared/types.js').FactoidRow[]>}
   */
  async getFactoidsByContactId(contactId) {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('factoids', 'readonly');
      const index = tx.objectStore('factoids').index('byContactId');
      const req = index.getAll(contactId);
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
  },

  /** @returns {Promise<import('../shared/types.js').FactoidRow[]>} */
  async getAllFactoids() {
    const result = await dbOp('factoids', 'getAll');
    return Array.isArray(result) ? result : [];
  },

  /**
   * Replace all factoids for a contact. Each item needs key, value, source; id and contactId are set here.
   * @param {string} contactId
   * @param {Array<{ id?: string, key: string, value: string, source?: string }>} factoids
   */
  async saveFactoidsForContact(contactId, factoids) {
    const database = await getDB();
    const genId = () =>
      crypto.randomUUID?.() ??
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    const rows = (factoids || []).map((f) => ({
      id: f.id || genId(),
      contactId,
      key: f.key || '',
      value: f.value || '',
      source: f.source,
    }));
    return new Promise((resolve, reject) => {
      const tx = database.transaction('factoids', 'readwrite');
      const s = tx.objectStore('factoids');
      const index = s.index('byContactId');
      const req = index.openCursor(IDBKeyRange.only(contactId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          for (const row of rows) s.put(row);
        }
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /** @param {import('../shared/types.js').SyncState} state */
  async saveSyncState(state) {
    STORAGE_LOG('saveSyncState');
    const withId = { ...state, id: 'current' };
    return dbOp('syncState', 'put', withId);
  },

  /** @returns {Promise<import('../shared/types.js').SyncState | null>} */
  async getSyncState() {
    const row = await dbOp('syncState', 'get', 'current');
    STORAGE_LOG('getSyncState:', row ? 'found' : 'null');
    if (!row) return null;
    const { id, ...rest } = row;
    return rest;
  },
};
