// I3 — Contact ID never changes for the same input.  I4 — merge keeps every absorbed ID.
// Expected IDs are literals computed independently (FNV-1a 64 over the normalized identifier, written from the
// algorithm, not copied from the extension). If one of these fails, you are about to orphan users' factoids (ADR 0002).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { extUrl, freshIndexedDB, quietLogs } from './helpers.mjs';

freshIndexedDB();
quietLogs();
const { storage } = await import(extUrl('lib/storage.js'));
const { processConnections } = await import(extUrl('lib/linkedin-processor.js'));
const { processFacebookConnections } = await import(extUrl('lib/facebook-processor.js'));
const { processGmailContacts } = await import(extUrl('lib/gmail-processor.js'));
const { processWhatsAppConnections } = await import(extUrl('lib/whatsapp-processor.js'));
const { mergeContacts, deduplicateAndMerge } = await import(extUrl('lib/dedup.js'));
const { getEffectiveContactIds } = await import(extUrl('lib/contact-effective-ids.js'));

const reset = () => storage.saveContacts([], { bypassShrinkGuard: true });
const ids = async () => (await storage.getAllContacts()).map((c) => c.id).sort();

beforeEach(reset);

const GOLDEN = {
  linkedin: 'linkedin:1c8a5bf412f5cdd2', // linkedin.com/in/jane-doe
  facebookProfilePhp: 'facebook:abf9606d44735944', // facebook.com/profile.php?id=100001234567
  facebookVanity: 'facebook:dee86f2c118e89e5', // facebook.com/janedoe
  gmail: 'gmail:1a5aed09c57b108c', // jane@example.com
  whatsapp: 'whatsapp:b8013c81890d1625', // 1234567890@c.us
};

test('I3 LinkedIn: golden ID, and URL variants collapse to it', async () => {
  const variants = [
    'https://www.linkedin.com/in/jane-doe',
    'http://linkedin.com/in/jane-doe/',
    'https://www.linkedin.com/in/jane-doe?miniProfileUrn=abc#x',
    'https://www.linkedin.com/in/jane-doe/en',
  ];
  for (const url of variants) {
    await reset();
    await processConnections([{ name: 'Jane Doe', profileUrl: url }]);
    assert.deepEqual(await ids(), [GOLDEN.linkedin], url);
  }
});

test('I3 Facebook: golden IDs for profile.php and vanity URLs', async () => {
  await processFacebookConnections([
    { name: 'A', profileUrl: 'https://www.facebook.com/profile.php?id=100001234567' },
    { name: 'B', profileUrl: 'https://www.facebook.com/janedoe/' },
  ]);
  assert.deepEqual(await ids(), [GOLDEN.facebookProfilePhp, GOLDEN.facebookVanity].sort());
});

test('I3 Gmail: golden ID, case and whitespace in the email do not matter', async () => {
  await processGmailContacts([{ name: 'Jane', email: '  Jane@Example.COM ' }]);
  assert.deepEqual(await ids(), [GOLDEN.gmail]);
});

test('I3 WhatsApp: golden ID, chat key case does not matter', async () => {
  await processWhatsAppConnections([{ name: 'Jane', chatKey: ' 1234567890@C.US ' }]);
  assert.deepEqual(await ids(), [GOLDEN.whatsapp]);
});

test('I3 re-importing the same person never creates a second contact or a new ID', async () => {
  await processConnections([{ name: 'Jane Doe', profileUrl: 'https://www.linkedin.com/in/jane-doe' }]);
  await processConnections([{ name: 'Jane Doe', profileUrl: 'https://www.linkedin.com/in/jane-doe', headline: 'CTO' }]);
  assert.deepEqual(await ids(), [GOLDEN.linkedin]);
});

const li = (id, name = 'Jane Doe') => ({
  id,
  displayName: name,
  platforms: { linkedin: { id, name, profileUrl: 'https://www.linkedin.com/in/jane-doe', normalizedProfileUrl: 'linkedin.com/in/jane-doe' } },
  factoids: [],
  lastInteraction: '2026-01-01T00:00:00.000Z',
  addedAt: '2026-01-01T00:00:00.000Z',
});
const gm = (id, email = 'jane@example.com') => ({
  id,
  displayName: 'Jane Doe',
  primaryEmail: email,
  platforms: { gmail: { id, email, name: 'Jane Doe' } },
  factoids: [],
  lastInteraction: '2026-02-01T00:00:00.000Z',
  addedAt: '2026-02-01T00:00:00.000Z',
});

test('I4 merging two platforms keeps both IDs reachable via getEffectiveContactIds', () => {
  const merged = mergeContacts(gm(GOLDEN.gmail), li(GOLDEN.linkedin));
  assert.equal(merged.id, GOLDEN.gmail, 'kept contact keeps its own id');
  assert.deepEqual(getEffectiveContactIds(merged).sort(), [GOLDEN.gmail, GOLDEN.linkedin].sort());
});

test('I4 the absorbed platform blob keeps what undo needs (id, name, and its own fields)', () => {
  const merged = mergeContacts(gm(GOLDEN.gmail), li(GOLDEN.linkedin));
  // handleUndoMerge (pages/contacts.js) rebuilds the contact from blob.id and blob.name; the gmail blob also needs email.
  assert.equal(merged.platforms.linkedin.id, GOLDEN.linkedin);
  assert.equal(merged.platforms.linkedin.name, 'Jane Doe');
  assert.equal(merged.platforms.gmail.email, 'jane@example.com');
});

test('I4 deduplicateAndMerge reports the absorbed ID in idMapping and drops no ID', () => {
  const { contacts, idMapping } = deduplicateAndMerge([gm(GOLDEN.gmail)], [li(GOLDEN.linkedin)]);
  assert.equal(contacts.length, 1);
  assert.equal(idMapping[GOLDEN.linkedin], GOLDEN.gmail);
  assert.deepEqual(getEffectiveContactIds(contacts[0]).sort(), [GOLDEN.gmail, GOLDEN.linkedin].sort());
});

test('I4 merge survives a save/load round trip through IndexedDB', async () => {
  const merged = mergeContacts(gm(GOLDEN.gmail), li(GOLDEN.linkedin));
  await storage.saveContacts([merged]);
  const [loaded] = await storage.getAllContacts();
  assert.deepEqual(getEffectiveContactIds(loaded).sort(), [GOLDEN.gmail, GOLDEN.linkedin].sort());
});

test('I4 factoids saved under an absorbed ID stay reachable through the merged contact', async () => {
  const merged = mergeContacts(gm(GOLDEN.gmail), li(GOLDEN.linkedin));
  await storage.saveFactoidsForContact(GOLDEN.linkedin, [{ key: 'city', value: 'Oslo' }]);
  const rows = [];
  for (const id of getEffectiveContactIds(merged)) rows.push(...(await storage.getFactoidsByContactId(id)));
  assert.deepEqual(rows.map((r) => r.value), ['Oslo']);
});

test('I4 getEffectiveContactIds returns each ID once', () => {
  const c = { id: 'a', platforms: { linkedin: { id: 'b' }, facebook: { id: 'b' }, gmail: { id: 'a' } } };
  assert.deepEqual(getEffectiveContactIds(c), ['a', 'b']);
});

// Issue 05 (fixed in 1.83.4): the kept blob's id used to be overwritten when both sides had the same platform.
const wa = (id, chat) => ({ id, displayName: 'Jane', platforms: { whatsapp: { id, chatKey: chat, name: 'Jane' } }, factoids: [], lastInteraction: '2026-01-01T00:00:00.000Z' });
const keptWithWa = () => ({ id: 'gmail:1', displayName: 'Jane', platforms: { gmail: { id: 'gmail:1', email: 'j@x.com' }, whatsapp: { id: 'whatsapp:A', chatKey: 'a', name: 'Jane' } }, factoids: [], lastInteraction: '2026-01-01T00:00:00.000Z' });

test('I4 same-platform merge keeps both platform IDs', () => {
  const merged = mergeContacts(keptWithWa(), wa('whatsapp:B', 'b'));
  assert.deepEqual(getEffectiveContactIds(merged).sort(), ['gmail:1', 'whatsapp:A', 'whatsapp:B']);
  assert.deepEqual(merged.platforms.whatsapp.absorbedIds, ['whatsapp:A']);
});

test('I4 three same-platform merges in a row keep all three IDs, each once', () => {
  let c = keptWithWa();
  c = mergeContacts(c, wa('whatsapp:B', 'b'));
  c = mergeContacts(c, wa('whatsapp:C', 'c'));
  c = mergeContacts(c, wa('whatsapp:C', 'c')); // repeat
  assert.deepEqual(getEffectiveContactIds(c).sort(), ['gmail:1', 'whatsapp:A', 'whatsapp:B', 'whatsapp:C']);
});

test('I4 re-syncing the same person adds no absorbedIds', () => {
  const merged = mergeContacts(wa('whatsapp:A', 'a'), wa('whatsapp:A', 'a'));
  assert.equal(merged.platforms.whatsapp.absorbedIds, undefined);
});

test('I4 legacy contacts (no absorbedIds anywhere) behave exactly as before', () => {
  const legacy = { id: 'gmail:1', platforms: { gmail: { id: 'gmail:1' }, linkedin: { id: 'linkedin:L' } } };
  assert.deepEqual(getEffectiveContactIds(legacy), ['gmail:1', 'linkedin:L']);
});

test('I4 manual merge through storage keeps the kept blob id and both contacts\' factoids reachable', async () => {
  await storage.saveContacts([keptWithWa(), wa('whatsapp:B', 'b')]);
  await storage.saveFactoidsForContact('whatsapp:A', [{ key: 'city', value: 'Oslo' }]);
  await storage.saveFactoidsForContact('whatsapp:B', [{ key: 'job', value: 'CTO' }]);
  await storage.mergeContactInto('gmail:1', 'whatsapp:B');
  const all = await storage.getAllContacts();
  assert.deepEqual(all.map((c) => c.id), ['gmail:1']);
  const rows = [];
  for (const id of getEffectiveContactIds(all[0])) rows.push(...(await storage.getFactoidsByContactId(id)));
  assert.deepEqual(rows.map((r) => r.value).sort(), ['CTO', 'Oslo']);
});

test('I4 merging a multi-platform contact does not discard the ids the stamping overwrites', async () => {
  const absorbed = { id: 'linkedin:L', displayName: 'Jane', platforms: { linkedin: { id: 'linkedin:L' }, facebook: { id: 'facebook:F' } }, factoids: [], lastInteraction: '2026-01-01T00:00:00.000Z' };
  await storage.saveContacts([{ id: 'gmail:1', displayName: 'Jane', platforms: { gmail: { id: 'gmail:1' } }, factoids: [], lastInteraction: '2026-01-01T00:00:00.000Z' }, absorbed]);
  await storage.mergeContactInto('gmail:1', 'linkedin:L');
  const [c] = await storage.getAllContacts();
  const effective = getEffectiveContactIds(c);
  assert.ok(effective.includes('linkedin:L') && effective.includes('facebook:F'), effective.join(','));
});

test('I4 an id absorbed earlier does not come back as a second contact on re-sync', () => {
  const merged = mergeContacts(keptWithWa(), wa('whatsapp:B', 'b')); // whatsapp:A is now only in absorbedIds
  const resyncedA = { ...wa('whatsapp:A', 'a'), displayName: 'Alice Ann' }; // different name: nothing else can match it
  const { contacts } = deduplicateAndMerge([merged], [resyncedA]);
  assert.equal(contacts.length, 1);
});
