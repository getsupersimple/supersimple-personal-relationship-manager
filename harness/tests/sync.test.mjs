// End-to-end LinkedIn sync through the real service worker (background/sw.js) with a stubbed `chrome` and a fake
// LinkedIn: connections page -> pagination responses -> contacts in IndexedDB. Catches a broken import, a removed
// helper or a changed parse path that unit tests of single modules would miss. It cannot catch LinkedIn changing
// its real response format; update the fixture from a captured response when that happens.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { extUrl, freshIndexedDB } from './helpers.mjs';

freshIndexedDB();
const realLog = console.log;
console.log = () => {};

const settings = { syncFacebookEnabled: false, syncWhatsAppEnabled: false, syncGmailEnabled: false, importLimit: 0 };
let onMessage;
globalThis.chrome = {
  runtime: {
    onMessage: { addListener: (fn) => (onMessage = fn) },
    onInstalled: { addListener() {} },
    getURL: (p) => p,
    sendMessage: async () => {},
    getContexts: async () => [],
  },
  storage: {
    local: {
      get: async (k) => Object.fromEntries([].concat(k ?? Object.keys(settings)).filter((x) => x in settings).map((x) => [x, settings[x]])),
      set: async (o) => void Object.assign(settings, o),
      remove: async (k) => void [].concat(k).forEach((x) => delete settings[x]),
    },
    onChanged: { addListener() {} },
  },
  cookies: { getAll: async () => [{ name: 'JSESSIONID', value: '"ajax:123"' }], get: async () => ({ name: 'JSESSIONID', value: '"ajax:123"' }) },
  tabs: { query: async () => [], onUpdated: { addListener() {}, removeListener() {} } },
  offscreen: { createDocument: async () => {}, Reason: {} },
};

const card = (slug, name, headline) =>
  `{"url":"https://www.linkedin.com/in/${slug}"},"a":["p",null,{"className":"x","children":["${name}"]}],"b":["p",null,{"children":["${headline}"]}]`;

let pages;
let connectionsHtml;
let paginationUrls;
let paginationTimes;
const respond = (text) => ({ ok: true, status: 200, url: '', text: async () => text, json: async () => JSON.parse(text), headers: { get: () => '', forEach() {} } });
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/mynetwork/invite-connect/connections')) return respond(connectionsHtml);
  if (!u.includes('/pagination')) return respond('<html></html>');
  paginationUrls.push(u);
  paginationTimes.push(Date.now());
  return respond(pages.shift() ?? '{}');
};

// Older response format: absolute profile URL, name and headline in "p" text nodes after it.
const oldCard = (slug, name, headline) =>
  `{"url":"https://www.linkedin.com/in/${slug}"},"a":["p",null,{"className":"x","children":["${name}"]}],"b":["p",null,{"children":["${headline}"]}]`;

// Format seen on the real connections list (2026-10): name and headline arrive as SetState "loading state" strings
// BEFORE the card's relative profile URL, which appears twice. Text is synthetic; the structure is copied from a capture.
const loadingState = (id, value) =>
  `{"$type":"proto.sdui.actions.core.SetState","value":{"state":{"key":{"key":{"value":{"$case":"id","id":"${id}"},"namespace":"ns"}},"value":{"$case":"stringValue","stringValue":"${value}"}}}}`;
const newCard = (slug, name, headline) =>
  loadingState('profile_name_loading_state', name) +
  loadingState('profile_headline_loading_state', headline) +
  `{"$type":"proto.sdui.actions.core.SetState","value":{"state":{"key":{"key":{"value":{"$case":"id","id":"profile_photo_loading_state"}}}}}}` +
  `,"filler":"${'x'.repeat(2200)}","vanityName":"${slug}","title":"","url":"/in/${slug}/","more":"${'y'.repeat(1800)}","title":"","url":"/in/${slug}/"},`;

// In the real page the pager ids sit inside escaped JSON (pagerId\":\"<id>\\"), and the feed pager comes first.
const pagerRef = (id) => String.raw`pagerId\":\"${id}\\"`;
const FEED = pagerRef('com.linkedin.sdui.pagers.feed.mainFeed');
const CONNECTIONS = pagerRef('com.linkedin.sdui.pagers.mynetwork.connectionsList');
const plainHtml = '<html>"pagerId":"com.linkedin.sdui.pagers.mynetwork.connectionsList"</html>';
const realHtml = `<html>${FEED} ${FEED} ${FEED} ${CONNECTIONS} ${CONNECTIONS}</html>`;

before(async () => {
  await import(extUrl('background/sw.js'));
});

const sync = () => new Promise((resolve) => onMessage({ action: 'SYNC' }, {}, resolve));

const run = async () => {
  console.log = () => {};
  paginationUrls = [];
  paginationTimes = [];
  const result = await sync();
  console.log = realLog;
  return result;
};

test('LinkedIn sync (older format): contacts are fetched, parsed and saved', async () => {
  connectionsHtml = plainHtml;
  pages = [oldCard('jane-doe', 'Jane Doe', 'Engineering leader at Acme Corporation') + oldCard('john-roe', 'John Roe', 'Product designer building tools')];
  const result = await run();
  assert.deepEqual(result.platformStatus.linkedin, { success: true });
  const { storage } = await import(extUrl('lib/storage.js'));
  const contacts = await storage.getAllContacts();
  assert.deepEqual(contacts.map((c) => c.displayName).sort(), ['Jane Doe', 'John Roe']);
  assert.ok(contacts.every((c) => /^linkedin:[0-9a-f]{16}$/.test(c.id)));
  const jane = contacts.find((c) => c.displayName === 'Jane Doe');
  assert.equal(jane.platforms.linkedin.profileUrl, 'https://www.linkedin.com/in/jane-doe');
  assert.equal((await storage.getFactoidsByContactId(jane.id))[0].value, 'Engineering leader at Acme Corporation');
});

test('LinkedIn sync (current format): feed pager listed first, relative /in/ urls, names from loading states', async () => {
  const { storage } = await import(extUrl('lib/storage.js'));
  await storage.clearAllContacts();
  connectionsHtml = realHtml;
  pages = [newCard('ana-silva-1a2b3c', 'Ana Silva', 'Head of Growth at Example Co') + newCard('li-wei', 'Li Wei', 'Staff engineer working on storage systems')];
  const result = await run();
  assert.ok(paginationUrls.length >= 1);
  assert.match(paginationUrls[0], /sduiid=com\.linkedin\.sdui\.pagers\.mynetwork\.connectionsList(&|$)/, 'must page the connections list, not the feed');
  assert.deepEqual(result.platformStatus.linkedin, { success: true });
  const contacts = await storage.getAllContacts();
  assert.deepEqual(contacts.map((c) => c.displayName).sort(), ['Ana Silva', 'Li Wei']);
  const ana = contacts.find((c) => c.displayName === 'Ana Silva');
  assert.equal(ana.platforms.linkedin.profileUrl, 'https://www.linkedin.com/in/ana-silva-1a2b3c');
  assert.equal((await storage.getFactoidsByContactId(ana.id))[0].value, 'Head of Growth at Example Co');
});

test('LinkedIn sync: the connections pager is chosen over an earlier feed pager', async () => {
  const { storage } = await import(extUrl('lib/storage.js'));
  await storage.clearAllContacts();
  connectionsHtml = `<html>${FEED} ${CONNECTIONS}</html>`;
  pages = [newCard('sam-ortiz', 'Sam Ortiz', 'Designer of calm software experiences')];
  await run();
  assert.match(paginationUrls[0], /pagers\.mynetwork\.connectionsList/);
});

test('LinkedIn sync: an empty first page reports a clear error instead of succeeding', async () => {
  connectionsHtml = plainHtml;
  pages = [];
  const result = await run();
  assert.equal(result.platformStatus.linkedin.success, false);
  assert.match(result.platformStatus.linkedin.error, /returned no connections/);
});

test('LinkedIn sync: with no setting, pages are requested about 1000 ms apart', async () => {
  const { storage } = await import(extUrl('lib/storage.js'));
  await storage.clearAllContacts();
  connectionsHtml = plainHtml;
  delete settings.paginationDelayMs;
  pages = [newCard('a-one', 'Alpha One', 'First person in the first page of results'), newCard('b-two', 'Beta Two', 'Second person in the second page of results')];
  await run();
  assert.ok(paginationTimes.length >= 2, `expected at least two page requests, got ${paginationTimes.length}`);
  for (let i = 1; i < paginationTimes.length; i++) {
    const gap = paginationTimes[i] - paginationTimes[i - 1];
    assert.ok(gap >= 990, `request ${i + 1} came ${gap} ms after the previous one; the default delay is 1000 ms`);
  }
});

test('LinkedIn sync: a delay of 0 left in storage by the old Settings page means the default, not back to back', async () => {
  const { storage } = await import(extUrl('lib/storage.js'));
  await storage.clearAllContacts();
  connectionsHtml = plainHtml;
  settings.paginationDelayMs = 0;
  pages = [newCard('e-five', 'Epsilon Five', 'First person in the first page of results'), newCard('f-six', 'Zeta Six', 'Second person in the second page of results')];
  await run();
  delete settings.paginationDelayMs;
  assert.ok(paginationTimes[1] - paginationTimes[0] >= 990);
});

test('LinkedIn sync: a tiny configured delay is raised to the 250 ms minimum', async () => {
  const { storage } = await import(extUrl('lib/storage.js'));
  await storage.clearAllContacts();
  connectionsHtml = plainHtml;
  settings.paginationDelayMs = 10;
  pages = [newCard('g-seven', 'Eta Seven', 'First person in the first page of results'), newCard('h-eight', 'Theta Eight', 'Second person in the second page of results')];
  await run();
  delete settings.paginationDelayMs;
  const gap = paginationTimes[1] - paginationTimes[0];
  assert.ok(gap >= 240 && gap < 900, `expected ~250 ms, got ${gap}`);
});

test('LinkedIn sync: the configured delay is honoured when it is above the minimum', async () => {
  const { storage } = await import(extUrl('lib/storage.js'));
  await storage.clearAllContacts();
  connectionsHtml = plainHtml;
  settings.paginationDelayMs = 700;
  pages = [newCard('c-three', 'Gamma Three', 'First person in the first page of results'), newCard('d-four', 'Delta Four', 'Second person in the second page of results')];
  await run();
  delete settings.paginationDelayMs;
  const gap = paginationTimes[1] - paginationTimes[0];
  assert.ok(gap >= 690, `expected ~700 ms between pages, got ${gap}`);
});
