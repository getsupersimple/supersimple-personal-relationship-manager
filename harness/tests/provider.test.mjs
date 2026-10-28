// ADR 0003 / I5: no contact with OpenAI (or anyone) unless the user entered the URL; legacy ChatGPT setting migrates;
// cached message text does not outlive its contact or network.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { extUrl, freshIndexedDB, quietLogs, installChromeStorageStub } from './helpers.mjs';

freshIndexedDB();
quietLogs();
const { openaiChatCompletion } = await import(extUrl('offscreen/openai-client.js'));
const migration = await import(extUrl('lib/provider-migration.js'));
const { DEFAULT_MODEL } = await import(extUrl('lib/model-ids.js'));
const { storage, purgeLatestMessageCache } = await import(extUrl('lib/storage.js'));

const msgs = [{ role: 'user', content: 'hi' }];
let fetchCalls;
beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return { ok: true, json: async () => ({ choices: [{ message: { content: ' hello ' } }] }), text: async () => '' };
  };
});

test('I5 no base URL: nothing is sent anywhere (no built-in OpenAI default)', async () => {
  const res = await openaiChatCompletion({ apiKey: 'sk-test', messages: msgs, model: 'gpt-4o-mini' });
  assert.equal(res.ok, false);
  assert.equal(fetchCalls.length, 0);
});

test('I5 base URL is the only destination, and /chat/completions is appended once', async () => {
  for (const base of ['https://llm.example.com/v1', 'https://llm.example.com/v1/', 'https://llm.example.com/v1/chat/completions']) {
    fetchCalls.length = 0;
    const res = await openaiChatCompletion({ baseUrl: base, model: 'm', messages: msgs });
    assert.deepEqual(res, { ok: true, text: 'hello' });
    assert.deepEqual(fetchCalls.map((c) => c.url), ['https://llm.example.com/v1/chat/completions']);
  }
});

test('I5 a user who enters the OpenAI URL themselves can use it; the key is sent only when set', async () => {
  await openaiChatCompletion({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: 'sk-test', messages: msgs });
  assert.equal(fetchCalls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(fetchCalls[0].init.headers.Authorization, 'Bearer sk-test');
  await openaiChatCompletion({ baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', messages: msgs });
  assert.equal(fetchCalls[1].init.headers.Authorization, undefined);
});

test('I5 missing model name sends nothing', async () => {
  const res = await openaiChatCompletion({ baseUrl: 'https://llm.example.com/v1', messages: msgs });
  assert.equal(res.ok, false);
  assert.equal(fetchCalls.length, 0);
});

test('provider migration: saved chatgpt falls back to default, key deleted, notice set once', async () => {
  const data = installChromeStorageStub({ webllmModel: 'chatgpt', openaiApiKey: 'sk-secret', localLlmApiKey: 'keep-me' });
  await migration.migrateRemovedChatGptProvider();
  assert.equal(data.webllmModel, DEFAULT_MODEL);
  assert.equal('openaiApiKey' in data, false);
  assert.equal(data.localLlmApiKey, 'keep-me');
  assert.match(data.prmProviderMigrationNotice, /ChatGPT option was removed/);
});

test('provider migration: other models untouched; stale key still removed; idempotent', async () => {
  const data = installChromeStorageStub({ webllmModel: 'local-openai', openaiApiKey: 'sk-secret' });
  await migration.migrateRemovedChatGptProvider();
  await migration.migrateRemovedChatGptProvider();
  assert.equal(data.webllmModel, 'local-openai');
  assert.equal('openaiApiKey' in data, false);
  assert.equal('prmProviderMigrationNotice' in data, false);
});

test('getSelectedModelId never returns chatgpt', async () => {
  installChromeStorageStub({ webllmModel: 'chatgpt' });
  assert.equal(await migration.getSelectedModelId(), DEFAULT_MODEL);
  installChromeStorageStub({});
  assert.equal(await migration.getSelectedModelId(), DEFAULT_MODEL);
  installChromeStorageStub({ webllmModel: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' });
  assert.equal(await migration.getSelectedModelId(), 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
});

const now = Date.now();
const cache = (age) => ({ fetchedAt: now - age, response: { body: 'secret text' } });
const DAY = 24 * 60 * 60 * 1000;

test('message cache: expired and malformed entries are purged, fresh ones kept, other keys untouched', async () => {
  const data = installChromeStorageStub({
    msgCache_a_linkedin: cache(1 * DAY),
    msgCache_b_linkedin: cache(8 * DAY),
    msgCache_c_linkedin: { response: {} },
    webllmModel: 'x',
  });
  await migration.purgeExpiredLatestMessageCache();
  assert.deepEqual(Object.keys(data).sort(), ['msgCache_a_linkedin', 'webllmModel']);
});

test('message cache: deleting a contact removes only that contact\'s entries', async () => {
  const data = installChromeStorageStub({ msgCache_a_linkedin: cache(0), msgCache_a_whatsapp: cache(0), msgCache_b_linkedin: cache(0) });
  await storage.deleteContact('a');
  assert.deepEqual(Object.keys(data), ['msgCache_b_linkedin']);
});

test('message cache: clearing a network removes that network\'s entries only', async () => {
  const data = installChromeStorageStub({ msgCache_a_linkedin: cache(0), msgCache_a_whatsapp: cache(0) });
  await storage.saveContacts([{ id: 'a', displayName: 'A', platforms: { linkedin: { id: 'a' } }, lastInteraction: '2026-01-01' }]);
  await storage.clearNetworkPlatform('linkedin');
  assert.deepEqual(Object.keys(data), ['msgCache_a_whatsapp']);
});

test('message cache: clearAllContacts removes everything cached', async () => {
  const data = installChromeStorageStub({ msgCache_a_linkedin: cache(0), keep: 1 });
  await storage.clearAllContacts();
  assert.deepEqual(Object.keys(data), ['keep']);
  assert.equal(await purgeLatestMessageCache(), 0);
});
