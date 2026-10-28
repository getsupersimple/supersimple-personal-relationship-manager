// The delay between page requests protects users' accounts from rate limits and bans, so every paginator shares one
// setting (Settings > "Delay between page requests"), a sensible default and a floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extUrl } from './helpers.mjs';

const { DEFAULT_PAGINATION_DELAY_MS, MIN_PAGINATION_DELAY_MS, resolvePaginationDelayMs, paginationDelayFromInput, collectCursorPages } =
  await import(extUrl('lib/pagination-delay.js'));

test('the default is 1000 ms and the minimum is 250 ms', () => {
  assert.equal(DEFAULT_PAGINATION_DELAY_MS, 1000);
  assert.equal(MIN_PAGINATION_DELAY_MS, 250);
});

test('stored value: missing, non-numeric, 0 or negative means the default', () => {
  for (const v of [undefined, null, NaN, '500', {}, Infinity, 0, -5]) assert.equal(resolvePaginationDelayMs(v), 1000, String(v));
});

test('stored value: small values are raised to the minimum, larger values are kept', () => {
  assert.equal(resolvePaginationDelayMs(1), 250);
  assert.equal(resolvePaginationDelayMs(100), 250);
  assert.equal(resolvePaginationDelayMs(250), 250);
  assert.equal(resolvePaginationDelayMs(1500.4), 1500);
});

test('settings field: blank never becomes 0 (the bug that removed the delay)', () => {
  for (const v of ['', '   ', undefined, null, 'abc', '0']) assert.equal(paginationDelayFromInput(v), 1000, String(v));
  assert.equal(paginationDelayFromInput('100'), 250);
  assert.equal(paginationDelayFromInput(' 800 '), 800);
});

const pagesOf = (...sizes) => {
  let i = 0;
  return async (cursor) => {
    const n = sizes[i++];
    return { success: true, items: Array.from({ length: n }, (_, k) => `item${i}-${k}`), nextCursor: i < sizes.length ? `c${i}` : null };
  };
};

test('collectCursorPages: waits the configured delay between pages, not before the first or after the last', async () => {
  const waits = [];
  const res = await collectCursorPages({ fetchPage: pagesOf(2, 2, 1), delayMs: 1234, sleep: async (ms) => void waits.push(ms) });
  assert.equal(res.success, true);
  assert.equal(res.items.length, 5);
  assert.deepEqual(waits, [1234, 1234]);
});

test('collectCursorPages: a single page needs no wait', async () => {
  const waits = [];
  const res = await collectCursorPages({ fetchPage: pagesOf(3), delayMs: 1000, sleep: async (ms) => void waits.push(ms) });
  assert.deepEqual({ ok: res.success, n: res.items.length, waits }, { ok: true, n: 3, waits: [] });
});

test('collectCursorPages: passes the cursor on, stops at maxPages and reports the first failure', async () => {
  const cursors = [];
  const fetchPage = async (cursor) => {
    cursors.push(cursor);
    return { success: true, items: ['x'], nextCursor: `n${cursors.length}` };
  };
  const capped = await collectCursorPages({ fetchPage, delayMs: 1, maxPages: 3, sleep: async () => {} });
  assert.equal(capped.items.length, 3);
  assert.deepEqual(cursors, [null, 'n1', 'n2']);

  let calls = 0;
  const failing = await collectCursorPages({
    fetchPage: async () => (++calls === 2 ? { success: false, error: 'boom' } : { success: true, items: ['a'], nextCursor: 'more' }),
    delayMs: 1,
    sleep: async () => {},
  });
  assert.deepEqual({ ok: failing.success, error: failing.error, kept: failing.items.length }, { ok: false, error: 'boom', kept: 1 });
});
