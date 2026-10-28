// I2 — factoid rows hold only id, contactId, key, value, source. No contact PII beside the ID (ADR 0002).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { extUrl, freshIndexedDB, quietLogs } from './helpers.mjs';

freshIndexedDB();
quietLogs();
const { storage } = await import(extUrl('lib/storage.js'));
const { parseFactoidsOutput } = await import(extUrl('offscreen/factoids-parser.js'));
const { mergeParsedFactoids } = await import(extUrl('lib/factoid-merge.js'));

const ALLOWED = ['contactId', 'id', 'key', 'source', 'value'];
const ID = 'linkedin:1c8a5bf412f5cdd2';

beforeEach(() => storage.saveFactoidsForContact(ID, []));

test('I2 saveFactoidsForContact stores only the five allowed fields, dropping extras', async () => {
  await storage.saveFactoidsForContact(ID, [
    { key: 'city', value: 'Oslo', source: 'llm', name: 'Jane Doe', email: 'jane@example.com', profileUrl: 'https://x/in/jane' },
  ]);
  const rows = await storage.getFactoidsByContactId(ID);
  assert.equal(rows.length, 1);
  for (const row of rows) {
    const extra = Object.keys(row).filter((k) => !ALLOWED.includes(k));
    assert.deepEqual(extra, [], 'unexpected fields on factoid row');
    assert.equal(row.contactId, ID);
  }
});

test('I2 contact fields never leak into the factoids store via saveContacts', async () => {
  const contact = {
    id: ID,
    displayName: 'Jane Doe',
    primaryEmail: 'jane@example.com',
    platforms: { linkedin: { id: ID, profileUrl: 'https://www.linkedin.com/in/jane-doe' } },
    factoids: [{ id: 'f1', key: 'headline', value: 'CTO', source: 'linkedin' }],
    lastInteraction: '2026-01-01T00:00:00.000Z',
  };
  await storage.saveContacts([contact]);
  const all = await storage.getAllFactoids();
  const blob = JSON.stringify(all);
  for (const pii of ['Jane Doe', 'jane@example.com', 'linkedin.com/in/jane-doe'])
    assert.ok(!blob.includes(pii), `factoid store contains ${pii}`);
  assert.deepEqual(all.map((r) => Object.keys(r).sort()), [['contactId', 'id', 'key', 'source', 'value']]);
});

test('I2 saveFactoidsForContact replaces, not appends', async () => {
  await storage.saveFactoidsForContact(ID, [{ key: 'a', value: '1' }, { key: 'b', value: '2' }]);
  await storage.saveFactoidsForContact(ID, [{ key: 'c', value: '3' }]);
  assert.deepEqual((await storage.getFactoidsByContactId(ID)).map((r) => r.key), ['c']);
});

test('I2 one contact\'s save does not touch another contact\'s factoids', async () => {
  await storage.saveFactoidsForContact('gmail:aaaa', [{ key: 'x', value: '1' }]);
  await storage.saveFactoidsForContact(ID, [{ key: 'y', value: '2' }]);
  assert.deepEqual((await storage.getFactoidsByContactId('gmail:aaaa')).map((r) => r.key), ['x']);
  await storage.saveFactoidsForContact('gmail:aaaa', []);
});

test('I2 parser output is only key/value pairs', () => {
  const res = parseFactoidsOutput('[{"key":"city","value":"Oslo","name":"Jane Doe"}]', 'lives in Oslo');
  assert.equal(res.ok, true);
  for (const f of res.factoids) assert.deepEqual(Object.keys(f).filter((k) => !['key', 'value'].includes(k)), []);
});

test('I2 merged factoids keep the same shape', () => {
  const { merged } = mergeParsedFactoids([{ id: '1', key: 'city', value: 'Oslo', source: 'user' }], [{ key: 'job', value: 'CTO' }], 'llm');
  for (const f of merged) assert.deepEqual(Object.keys(f).filter((k) => !ALLOWED.includes(k)), []);
});
