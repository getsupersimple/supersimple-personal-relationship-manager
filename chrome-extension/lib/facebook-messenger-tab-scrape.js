/**
 * Open an inactive tab on a Messenger thread URL, run the page's JS, then read
 * the messages container via XPath (same structure as a saved full DOM e.g. john.html).
 */

import { sleep, withBackgroundTab } from './tab-scraper-utils.js';

export const FB_MESSENGER_MESSAGES_CONTAINER_XPATH =
  '/html/body/div[1]/div/div[1]/div/div[3]/div/div/div[1]/div[1]/div/div[2]/div/div/div/div[1]/div/div/div/div[1]/div/div[2]/div/div/div/div[1]/div/div/div/div';

const DEFAULT_FIRST_WAIT_MS = 2000;
const DEFAULT_RETRY_DELAY_MS = 3000;
const DEFAULT_MAX_ATTEMPTS = 8;

/**
 * Pick a plausible "latest message" line from the full messages container innerText.
 * @param {string} innerText
 * @returns {{ text: string, fromName?: string, deliveredAt?: null } | null}
 */
export function extractLatestFacebookMessageFromMessengerContainer(innerText) {
  if (!innerText || typeof innerText !== 'string') return null;
  const lines = innerText
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const skipSubstrings = [
    'end-to-end encryption',
    'Enter',
    'Message',
    'Search',
    'Active now',
    'Messenger',
  ];
  const skipExact = new Set(['You sent', 'You replied', '·', '…']);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.length < 2) continue;
    if (skipExact.has(line)) continue;
    if (skipSubstrings.some((s) => line.includes(s))) continue;
    return { text: line, fromName: undefined, deliveredAt: null };
  }
  return null;
}

/**
 * Collect up to `limit` recent message lines from the messages container innerText (oldest → newest).
 * @param {string} innerText
 * @param {number} [limit]
 * @returns {Array<{ text: string, fromName?: string, deliveredAt?: null }>}
 */
export function extractRecentFacebookMessagesFromMessengerContainer(innerText, limit = 5) {
  if (!innerText || typeof innerText !== 'string') return [];
  const n = Math.max(1, Math.min(Number(limit) || 5, 25));
  const lines = innerText
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const skipSubstrings = [
    'end-to-end encryption',
    'Enter',
    'Message',
    'Search',
    'Active now',
    'Messenger',
  ];
  const skipExact = new Set(['You sent', 'You replied', '·', '…']);
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < n; i--) {
    const line = lines[i];
    if (line.length < 2) continue;
    if (skipExact.has(line)) continue;
    if (skipSubstrings.some((s) => line.includes(s))) continue;
    out.push({ text: line, fromName: undefined, deliveredAt: null });
  }
  return out.reverse();
}

/**
 * @param {string} threadUrl
 * @param {{ log?: (...a: unknown[]) => void, firstWaitMs?: number, retryDelayMs?: number, maxAttempts?: number }} [options]
 * @returns {Promise<{ success: true, innerText: string, innerHTML: string } | { error: string }>}
 */
export async function scrapeFacebookMessengerThreadViaBackgroundTab(threadUrl, options = {}) {
  const log = options.log || (() => {});
  const firstWaitMs = options.firstWaitMs ?? DEFAULT_FIRST_WAIT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const url = (threadUrl || '').trim();
  if (!url.startsWith('http')) {
    return { error: 'Invalid Messenger thread URL.' };
  }

  try {
    return await withBackgroundTab(url, async (tabId) => {
      log('facebookMessengerTabScrape: tab loaded, waiting for UI…');
      await sleep(firstWaitMs);

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        /** @type {{ ok?: boolean, innerText?: string, innerHTML?: string, error?: string }} */
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: (xpath) => {
            try {
              const xr = document.evaluate(
                xpath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
              );
              const node = xr.singleNodeValue;
              if (!node || node.nodeType !== Node.ELEMENT_NODE) {
                return { ok: false, error: 'xpath_miss' };
              }
              const el = /** @type {Element} */ (node);
              return {
                ok: true,
                innerText: el.innerText || '',
                innerHTML: el.innerHTML || '',
              };
            } catch (e) {
              return { ok: false, error: String(e?.message || e) };
            }
          },
          args: [FB_MESSENGER_MESSAGES_CONTAINER_XPATH],
        });
        const r = results[0]?.result;
        const textLen = (r?.innerText || '').trim().length;
        const htmlLen = (r?.innerHTML || '').length;
        if (r?.ok && (textLen > 0 || htmlLen > 0)) {
          log('facebookMessengerTabScrape: hit container', { attempt, textLen, htmlLen });
          return {
            success: true,
            innerText: r.innerText || '',
            innerHTML: r.innerHTML || '',
          };
        }
        log('facebookMessengerTabScrape: attempt', attempt, '/', maxAttempts, 'miss', r?.error || 'empty');
        if (attempt < maxAttempts) await sleep(retryDelayMs);
      }

      return {
        error:
          'Messenger messages container not found or empty after background tab load. XPath may have changed or the thread did not render.',
      };
    }, { log, label: 'Facebook Messenger' });
  } catch (e) {
    const msg = e?.message || String(e);
    log('facebookMessengerTabScrape: error', msg);
    return { error: msg || 'Background tab scrape failed.' };
  }
}
