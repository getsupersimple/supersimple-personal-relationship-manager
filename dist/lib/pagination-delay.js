/**
 * The delay between page requests when importing from a platform. One setting (Settings > "Delay between page
 * requests") paces every paginator: LinkedIn, Facebook and the Google Contacts list pages. Rapid-fire requests look
 * like a bot and can get the user's account rate limited or banned, so there is a default and a floor.
 */
export const DEFAULT_PAGINATION_DELAY_MS = 1000;
export const MIN_PAGINATION_DELAY_MS = 250;

/** @param {number} ms */
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The delay to use for a stored setting. Missing, non-numeric, zero or negative means the default (0 was what the
 * Settings page used to save for a blank field, never a deliberate choice); other small values are raised to the minimum.
 * @param {unknown} configured - the `paginationDelayMs` value from chrome.storage.local
 * @returns {number} milliseconds
 */
export function resolvePaginationDelayMs(configured) {
  if (typeof configured !== 'number' || !Number.isFinite(configured) || configured <= 0) return DEFAULT_PAGINATION_DELAY_MS;
  return Math.max(MIN_PAGINATION_DELAY_MS, Math.round(configured));
}

/**
 * Parse the Settings field: blank, invalid or 0 means the default, anything else is clamped to the minimum.
 * @param {string} text
 * @returns {number}
 */
export function paginationDelayFromInput(text) {
  return resolvePaginationDelayMs(parseInt(String(text ?? '').trim(), 10));
}

/** The user's delay setting (service worker and pages), already resolved. */
export async function getPaginationDelayMs() {
  const { paginationDelayMs } = await chrome.storage.local.get('paginationDelayMs');
  return resolvePaginationDelayMs(paginationDelayMs);
}

/**
 * Walk a cursor-paged list, waiting `delayMs` between pages (not before the first or after the last).
 * @param {{
 *   fetchPage: (cursor: string | null, page: number) => Promise<{ success: boolean, items?: unknown[], nextCursor?: string | null, error?: string }>,
 *   delayMs: number,
 *   maxPages?: number,
 *   sleep?: (ms: number) => Promise<void>,
 * }} args
 * @returns {Promise<{ success: true, items: unknown[] } | { success: false, error?: string, items: unknown[] }>}
 */
export async function collectCursorPages({ fetchPage, delayMs, maxPages = 500, sleep = pause }) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(cursor, page);
    if (!result.success) return { success: false, error: result.error, items };
    if (result.items?.length) items.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
    await sleep(delayMs);
  }
  return { success: true, items };
}
