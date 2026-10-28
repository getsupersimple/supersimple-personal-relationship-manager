// I10 — IndexedDB schema changes bump DB_VERSION and carry a migration; existing user data survives opening.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXT, freshIndexedDB, quietLogs, importFreshStorage, idb } from './helpers.mjs';

quietLogs();

// Update this snapshot only together with a DB_VERSION bump AND a new migration test below.
const SCHEMA = {
  version: 2,
  stores: { contacts: 'id', conversations: 'id', syncState: 'id', factoids: 'id' },
  indexes: { factoids: ['byContactId:contactId'] },
};

test('I10 pin: stores, indexes and DB_VERSION match the snapshot', () => {
  const src = readFileSync(join(EXT, 'lib/storage.js'), 'utf8');
  assert.equal(Number(src.match(/const DB_VERSION = (\d+)/)[1]), SCHEMA.version, 'DB_VERSION changed: add a migration test and update SCHEMA');
  const stores = Object.fromEntries([...src.matchAll(/createObjectStore\('(\w+)', \{ keyPath: '(\w+)' \}\)/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(stores, SCHEMA.stores, 'object stores changed: bump DB_VERSION, add a migration test, update SCHEMA');
  const indexes = [...src.matchAll(/createIndex\('(\w+)', '(\w+)'/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(indexes, SCHEMA.indexes.factoids, 'indexes changed: bump DB_VERSION, add a migration test, update SCHEMA');
});

const contact = { id: 'linkedin:1c8a5bf412f5cdd2', displayName: 'Jane Doe', platforms: { linkedin: { id: 'linkedin:1c8a5bf412f5cdd2' } }, lastInteraction: '2026-01-01T00:00:00.000Z' };

test('I10 synthetic v1 database (no factoids store) upgrades to v2 and keeps its contacts', async () => {
  freshIndexedDB();
  const v1 = await idb.open('prm-contacts', 1, (db) => {
    db.createObjectStore('contacts', { keyPath: 'id' });
    db.createObjectStore('conversations', { keyPath: 'id' });
    db.createObjectStore('syncState', { keyPath: 'id' });
  });
  await idb.put(v1, 'contacts', contact);
  await idb.put(v1, 'syncState', { id: 'current', lastSync: '2026-01-01T00:00:00.000Z', platformStatus: {} });
  v1.close();

  const storage = await importFreshStorage();
  assert.deepEqual((await storage.getAllContacts()).map((c) => c.id), [contact.id]);
  assert.equal((await storage.getSyncState()).lastSync, '2026-01-01T00:00:00.000Z');
  await storage.saveFactoidsForContact(contact.id, [{ key: 'city', value: 'Oslo' }]);
  assert.equal((await storage.getFactoidsByContactId(contact.id)).length, 1, 'factoids store + byContactId index exist after upgrade');
});

test('I10 legacy prm-rolodex database is copied into prm-contacts and removed', async () => {
  freshIndexedDB();
  const legacy = await idb.open('prm-rolodex', 1, (db) => {
    db.createObjectStore('contacts', { keyPath: 'id' });
    const f = db.createObjectStore('factoids', { keyPath: 'id' });
    f.createIndex('byContactId', 'contactId', { unique: false });
  });
  await idb.put(legacy, 'contacts', contact);
  await idb.put(legacy, 'factoids', { id: 'f1', contactId: contact.id, key: 'city', value: 'Oslo', source: 'user' });
  legacy.close();

  const storage = await importFreshStorage();
  assert.deepEqual((await storage.getAllContacts()).map((c) => c.id), [contact.id]);
  assert.deepEqual((await storage.getFactoidsByContactId(contact.id)).map((r) => r.value), ['Oslo']);
  const names = (await indexedDB.databases()).map((d) => d.name);
  assert.ok(!names.includes('prm-rolodex'), 'legacy database should be deleted after migration');
});

test('I10 opening twice (already current) loses nothing', async () => {
  freshIndexedDB();
  const a = await importFreshStorage();
  await a.saveContacts([contact]);
  await a.saveFactoidsForContact(contact.id, [{ key: 'city', value: 'Oslo' }]);
  const b = await importFreshStorage();
  assert.equal((await b.getAllContacts()).length, 1);
  assert.equal((await b.getFactoidsByContactId(contact.id)).length, 1);
});
