// Factoid export carries no names (ADR 0002); old files still import; contact exports include absorbed-ID factoids.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { extUrl, freshIndexedDB, quietLogs } from './helpers.mjs';

freshIndexedDB();
quietLogs();
const { storage } = await import(extUrl('lib/storage.js'));
const csv = await import(extUrl('lib/network-contact-csv.js'));

const contact = (id, name, platforms = {}) => ({ id, displayName: name, platforms, factoids: [], lastInteraction: '2026-01-01T00:00:00.000Z' });

beforeEach(async () => {
  await storage.clearAllContacts();
});

test('factoid export: header and rows have no displayName', async () => {
  await storage.saveContacts([contact('linkedin:L', 'Jane Doe', { linkedin: { id: 'linkedin:L' } })]);
  await storage.saveFactoidsForContact('linkedin:L', [{ key: 'city', value: 'Oslo', source: 'user' }]);
  const text = await csv.exportFactoidsCsv();
  assert.deepEqual(csv.parseCsv(text)[0], ['contactId', 'key', 'value', 'source']);
  assert.ok(!text.includes('Jane Doe'));
});

test('factoid export includes rows for ids that no longer have a contact row', async () => {
  await storage.saveFactoidsForContact('whatsapp:A', [{ key: 'job', value: 'CTO' }]);
  const rows = csv.parseCsv(await csv.exportFactoidsCsv());
  assert.deepEqual(rows[1], ['whatsapp:A', 'job', 'CTO', '']);
});

test('factoid import: new format round-trips', async () => {
  await storage.saveFactoidsForContact('linkedin:L', [{ key: 'city', value: 'Oslo' }]);
  const text = await csv.exportFactoidsCsv();
  await storage.saveFactoidsForContact('linkedin:L', []);
  const res = await csv.importFactoidsCsv(text);
  assert.equal(res.importedRows, 1);
  assert.deepEqual((await storage.getFactoidsByContactId('linkedin:L')).map((f) => f.value), ['Oslo']);
});

test('factoid import: files exported before this change (with displayName) still import, name ignored', async () => {
  const legacy = 'contactId,displayName,key,value,source\r\nlinkedin:L,Jane Doe,city,Oslo,user\r\n';
  const res = await csv.importFactoidsCsv(legacy);
  assert.equal(res.importedRows, 1);
  const rows = await storage.getFactoidsByContactId('linkedin:L');
  assert.deepEqual(rows.map((f) => f.value), ['Oslo']);
  assert.ok(!JSON.stringify(rows).includes('Jane Doe'));
});

test('factoid import: unknown header is still rejected', async () => {
  await assert.rejects(() => csv.importFactoidsCsv('a,b,c\r\n1,2,3\r\n'), /Invalid CSV header/);
});

test('all-contacts export includes factoids held under absorbed ids (issue 05 follow-up)', async () => {
  const merged = contact('gmail:1', 'Jane', {
    gmail: { id: 'gmail:1', email: 'j@x.com' },
    whatsapp: { id: 'whatsapp:B', absorbedIds: ['whatsapp:A'], chatKey: 'b' },
  });
  await storage.saveContacts([merged]);
  await storage.saveFactoidsForContact('gmail:1', [{ key: 'own', value: '1' }]);
  await storage.saveFactoidsForContact('whatsapp:A', [{ key: 'a', value: '2' }]);
  await storage.saveFactoidsForContact('whatsapp:B', [{ key: 'b', value: '3' }]);
  const rows = csv.parseCsv(await csv.exportAllContactsCsv());
  const header = rows[0];
  const factoids = JSON.parse(rows[1][header.indexOf('factoidsJson')]);
  assert.deepEqual(factoids.map((f) => f.value).sort(), ['1', '2', '3']);
});

// ---- contact exports/imports (per platform and all contacts): pinned before the shared-helper refactor ----
const li = (id, name, extra = {}) => ({ id, displayName: name, platforms: { linkedin: { id, profileUrl: `https://www.linkedin.com/in/${name}`, normalizedProfileUrl: `linkedin.com/in/${name}` } }, factoids: [], lastInteraction: '2026-01-01T00:00:00.000Z', addedAt: '2026-01-02T00:00:00.000Z', ...extra });
const wa = (id, name) => ({ id, displayName: name, platforms: { whatsapp: { id, chatKey: `${name}@c.us`, name } }, factoids: [], lastInteraction: '2026-02-01T00:00:00.000Z' });

test('per-platform export: exact header, only that network, platform blob only', async () => {
  await storage.saveContacts([li('linkedin:A', 'ann', { conversationSummary: 'Hi, there', conversationSummaryAt: 1700000000000, recentAccesses: ['2026-03-01T00:00:00.000Z'] }), wa('whatsapp:B', 'bob')]);
  await storage.saveFactoidsForContact('linkedin:A', [{ key: 'city', value: 'Oslo', source: 'user' }]);
  const rows = csv.parseCsv(await csv.exportPlatformContactsCsv('linkedin'));
  assert.deepEqual(rows[0], [...csv.NETWORK_CSV_HEADERS]);
  assert.equal(rows.length, 2);
  const row = Object.fromEntries(rows[0].map((h, i) => [h, rows[1][i]]));
  assert.equal(row.id, 'linkedin:A');
  assert.equal(row.conversationSummary, 'Hi, there');
  assert.equal(row.conversationSummaryAt, '1700000000000');
  assert.deepEqual(JSON.parse(row.recentAccessesJson), ['2026-03-01T00:00:00.000Z']);
  assert.equal(JSON.parse(row.platformJson).id, 'linkedin:A');
  assert.deepEqual(JSON.parse(row.factoidsJson).map((f) => f.value), ['Oslo']);
  await assert.rejects(() => csv.exportPlatformContactsCsv('myspace'), /Invalid platform: myspace/);
});

test('per-platform import: restores contacts and factoids into an empty database', async () => {
  await storage.saveContacts([li('linkedin:A', 'ann'), li('linkedin:C', 'cat')]);
  await storage.saveFactoidsForContact('linkedin:A', [{ key: 'city', value: 'Oslo', source: 'user' }]);
  const text = await csv.exportPlatformContactsCsv('linkedin');
  await storage.clearAllContacts();
  const res = await csv.importPlatformContactsCsv('linkedin', text);
  assert.deepEqual(res, { importedRows: 2, totalContacts: 2 });
  const all = await storage.getAllContacts();
  assert.deepEqual(all.map((c) => c.id).sort(), ['linkedin:A', 'linkedin:C']);
  assert.equal(all.find((c) => c.id === 'linkedin:A').addedAt, '2026-01-02T00:00:00.000Z');
  assert.deepEqual((await storage.getFactoidsByContactId('linkedin:A')).map((f) => f.value), ['Oslo']);
});

test('all-contacts import: round-trips a contact that has several networks', async () => {
  const merged = { id: 'gmail:1', displayName: 'Jane', primaryEmail: 'j@x.com', platforms: { gmail: { id: 'gmail:1', email: 'j@x.com' }, whatsapp: { id: 'whatsapp:W', chatKey: 'j@c.us' } }, factoids: [], lastInteraction: '2026-01-01T00:00:00.000Z' };
  await storage.saveContacts([merged]);
  await storage.saveFactoidsForContact('gmail:1', [{ key: 'job', value: 'CTO' }]);
  const text = await csv.exportAllContactsCsv();
  await storage.clearAllContacts();
  const res = await csv.importAllContactsCsv(text);
  assert.deepEqual(res, { importedRows: 1, totalContacts: 1 });
  const [c] = await storage.getAllContacts();
  assert.deepEqual(Object.keys(c.platforms).sort(), ['gmail', 'whatsapp']);
  assert.equal(c.primaryEmail, 'j@x.com');
  assert.deepEqual((await storage.getFactoidsByContactId('gmail:1')).map((f) => f.value), ['CTO']);
});

test('contact imports: header and row validation messages', async () => {
  await assert.rejects(() => csv.importPlatformContactsCsv('linkedin', 'id\r\n'), /CSV has no data rows/);
  await assert.rejects(() => csv.importPlatformContactsCsv('linkedin', 'a,b\r\n1,2\r\n'), /Invalid CSV header\. Expected columns: id, displayName/);
  await assert.rejects(() => csv.importAllContactsCsv('a,b\r\n1,2\r\n'), /Invalid CSV header\. Expected columns: id, displayName/);
  await assert.rejects(() => csv.importPlatformContactsCsv('myspace', 'x'), /Invalid platform: myspace/);
  const head = [...csv.NETWORK_CSV_HEADERS].join(',');
  await assert.rejects(() => csv.importPlatformContactsCsv('linkedin', `${head}\r\n,Ann,,,,,,,[],{},[]\r\n`), /Row 2: missing id/);
  await assert.rejects(() => csv.importPlatformContactsCsv('linkedin', `${head}\r\nx,Ann,,,,,,,[],{bad,[]\r\n`), /Row 2: invalid platformJson/);
  await assert.rejects(() => csv.importPlatformContactsCsv('linkedin', `${head}\r\nx,Ann,,,,,,,[],[],[]\r\n`), /Row 2: platformJson must be a JSON object/);
  await assert.rejects(() => csv.importPlatformContactsCsv('linkedin', `${head}\r\nx,Ann,,,,,,,[],{},nope\r\n`), /Row 2: invalid factoidsJson/);
  await assert.rejects(() => csv.importPlatformContactsCsv('linkedin', `${head}\r\n,,,,,,,,,,\r\n`), /No contact rows found in CSV/);
});

test('contact import: blank name becomes Unknown, short rows are padded', async () => {
  const head = [...csv.NETWORK_CSV_HEADERS].join(',');
  await csv.importPlatformContactsCsv('linkedin', `${head}\r\nlinkedin:Z,,,,,,,,,"{""id"":""linkedin:Z""}"\r\n`);
  const z = (await storage.getAllContacts()).find((c) => c.id === 'linkedin:Z');
  assert.equal(z.displayName, 'Unknown');
});
