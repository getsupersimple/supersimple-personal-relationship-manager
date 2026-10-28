// Offscreen handlers on the Local LLM path (the WebLLM path needs a GPU engine and is not exercised here).
// Pins request parameters and result shapes so the provider dispatch can be refactored safely.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { extUrl, quietLogs } from './helpers.mjs';

quietLogs();
globalThis.chrome = { runtime: { sendMessage: () => Promise.resolve() } };
const { handleWebllmParseFactoids } = await import(extUrl('offscreen/handlers/parse-factoids-handler.js'));
const { handleWebllmSummarizeMessage } = await import(extUrl('offscreen/handlers/summarize-handler.js'));
const { handleWebllmChat } = await import(extUrl('offscreen/handlers/chat-handler.js'));

const LOCAL = { modelId: 'local-openai', localLlmBaseUrl: 'https://llm.test/v1', localLlmModel: 'm1', localLlmApiKey: 'k' };
let calls;
let replies;
beforeEach(() => {
  calls = [];
  replies = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.Authorization });
    const next = replies.length ? replies.shift() : 'ok';
    if (next instanceof Error) throw next;
    if (typeof next === 'object' && next.status) return { ok: false, status: next.status, text: async () => 'bad' };
    return { ok: true, json: async () => ({ choices: [{ message: { content: next } }] }) };
  };
});

test('parse: sends the factoid prompt at temperature 0.1 and returns parsed facts plus the raw reply', async () => {
  replies = ['[{"key":"city","value":"Oslo"}]'];
  const res = await handleWebllmParseFactoids({ text: '  lives in Oslo ', ...LOCAL });
  assert.deepEqual(res.factoids, [{ key: 'city', value: 'Oslo' }]);
  assert.equal(res.rawOutput, '[{"key":"city","value":"Oslo"}]');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://llm.test/v1/chat/completions');
  assert.equal(calls[0].auth, 'Bearer k');
  assert.equal(calls[0].body.model, 'm1');
  assert.equal(calls[0].body.temperature, 0.1);
  assert.equal(calls[0].body.max_tokens, 512);
  assert.deepEqual(calls[0].body.messages.map((m) => m.role), ['system', 'user']);
  assert.equal(calls[0].body.messages[1].content, 'lives in Oslo');
});

test('parse: empty text and missing server config never call the server', async () => {
  assert.deepEqual(await handleWebllmParseFactoids({ text: '   ', ...LOCAL }), { error: 'No text provided' });
  const res = await handleWebllmParseFactoids({ text: 'x', modelId: 'local-openai' });
  assert.match(res.error, /Local LLM base URL and model name are required/);
  assert.equal(calls.length, 0);
});

test('parse: server failure and unparsable output are reported', async () => {
  replies = [{ status: 500 }];
  assert.match((await handleWebllmParseFactoids({ text: 'x', ...LOCAL })).error, /Local LLM request failed/);
  replies = ['not json at all'];
  const res = await handleWebllmParseFactoids({ text: 'x', ...LOCAL });
  assert.ok(res.error);
  assert.equal(res.rawOutput, 'not json at all');
});

test('summarize: thread variant allows longer input and output; single message is shorter', async () => {
  replies = ['  A summary.  '];
  const res = await handleWebllmSummarizeMessage({ text: 'x'.repeat(9000), summaryVariant: 'recent_thread', ...LOCAL });
  assert.deepEqual(res, { summary: 'A summary.' });
  assert.equal(calls[0].body.temperature, 0.2);
  assert.equal(calls[0].body.max_tokens, 220);
  assert.equal(calls[0].body.messages[1].content.length, 8000);
  replies = ['short'];
  await handleWebllmSummarizeMessage({ text: 'y'.repeat(3000), ...LOCAL });
  assert.equal(calls[1].body.max_tokens, 150);
  assert.equal(calls[1].body.messages[1].content.length, 2000);
});

test('summarize: the reply is capped at 500 characters; errors and empty text are handled', async () => {
  replies = ['z'.repeat(900)];
  assert.equal((await handleWebllmSummarizeMessage({ text: 'hi', ...LOCAL })).summary.length, 500);
  assert.deepEqual(await handleWebllmSummarizeMessage({ text: '', ...LOCAL }), { error: 'No text provided' });
  replies = [{ status: 502 }];
  assert.match((await handleWebllmSummarizeMessage({ text: 'hi', ...LOCAL })).error, /Local LLM request failed/);
  const cfg = await handleWebllmSummarizeMessage({ text: 'hi', modelId: 'local-openai' });
  assert.match(cfg.error, /required/);
});

test('chat without a contact: one general call at temperature 0.3', async () => {
  replies = ['  Hello there  '];
  const res = await handleWebllmChat({ prompt: 'hi', history: [{ role: 'user', content: 'earlier' }], ...LOCAL });
  assert.equal(res.answer, 'Hello there');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.temperature, 0.3);
  assert.equal(calls[0].body.max_tokens, 512);
  assert.equal(res.calls.length, 1);
  assert.equal(res.calls[0].reply, 'Hello there');
});

test('chat about a contact: relevance, answer, then extraction for a statement', async () => {
  replies = ['["city"]', 'She lives in Oslo.', '[{"key":"job","value":"CTO"}]'];
  const res = await handleWebllmChat({
    prompt: 'She is now a CTO',
    contactName: 'Jane Doe',
    factoids: [{ key: 'city', value: 'Oslo' }, { key: 'job', value: 'Engineer' }],
    conversations: [],
    ...LOCAL,
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].body.max_tokens, 200);
  assert.equal(calls[1].body.max_tokens, 512);
  assert.equal(calls[2].body.temperature, 0.1);
  assert.equal(res.answer, 'She lives in Oslo.');
  assert.deepEqual(res.extractedFactoids, [{ key: 'job', value: 'CTO' }]);
  assert.deepEqual(res.calls.map((c) => c.label), ['Pass 1: Relevance', 'Pass 2: Answer', 'Pass 3: Extract facts']);
});

test('chat about a contact: a pure question skips extraction', async () => {
  replies = ['ALL', 'Oslo.'];
  const res = await handleWebllmChat({ prompt: 'Where does she live?', contactName: 'Jane Doe', factoids: [{ key: 'city', value: 'Oslo' }], conversations: [], ...LOCAL });
  assert.equal(calls.length, 2);
  assert.equal(res.extractedFactoids, null);
  assert.equal(res.answer, 'Oslo.');
});

test('chat: an answer-pass failure returns the error and its call log', async () => {
  replies = ['ALL', { status: 500 }];
  const res = await handleWebllmChat({ prompt: 'Where?', contactName: 'Jane', factoids: [{ key: 'a', value: 'b' }], conversations: [], ...LOCAL });
  assert.match(res.error, /Local LLM request failed/);
  assert.equal(res.calls.length, 2);
});

test('chat: Local LLM without configuration returns the setup error before any call', async () => {
  const res = await handleWebllmChat({ prompt: 'hi', modelId: 'local-openai' });
  assert.match(res.error, /required/);
  assert.equal(calls.length, 0);
});

test('chat: previewOnly and a hand-edited full prompt', async () => {
  const preview = await handleWebllmChat({ prompt: 'hi', previewOnly: true, ...LOCAL });
  assert.equal(preview.preview, true);
  assert.equal(calls.length, 0);
  replies = ['edited reply'];
  const res = await handleWebllmChat({ prompt: '', overrideFullPrompt: '[USER]\nhello', ...LOCAL });
  assert.equal(res.answer, 'edited reply');
  assert.equal(calls.length, 1);
});
