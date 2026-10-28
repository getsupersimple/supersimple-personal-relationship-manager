/**
 * Parse Messenger thread URLs and extract thread `updated_time` from embedded
 * Relay/Comet JSON in page HTML (per-message times are often absent in DOM).
 */

import { coerceDeliveredAtToMs } from './message-time.js';

/** Unix seconds — ignore noise outside a plausible range */
const MIN_UPDATED_TIME_S = 946684800; // 2000-01-01
const MAX_UPDATED_TIME_S = 2524608000; // ~2049

/**
 * Thread key segment after /messages/t/, /messages/e2ee/t/, messenger.com/t/, etc.
 * @param {string} threadUrl
 * @returns {string}
 */
export function extractMessengerThreadKeyFromUrl(threadUrl) {
  const m = String(threadUrl || '').match(/\/(?:e2ee\/)?t\/([^/?#]+)/i);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1].trim());
  } catch {
    return m[1].trim();
  }
}

/**
 * @param {string} html
 * @returns {number} ms, 0 if none
 */
function maxUpdatedTimeMsInHtml(html) {
  if (!html) return 0;
  // Relay / GraphQL payloads (double quotes); rare escaped forms in strings
  const patterns = [
    /"updated_time"\s*:\s*(\d+)/g,
    /\\"updated_time\\"\s*:\s*(\d+)/g,
  ];
  let best = 0;
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n < MIN_UPDATED_TIME_S || n > MAX_UPDATED_TIME_S) continue;
      const ms = coerceDeliveredAtToMs(n);
      if (ms > best) best = ms;
    }
  }
  return best;
}

/**
 * Slug and numeric threads: find `updated_time` in JSON near where the thread path appears
 * (full document HTML). The messages-container innerHTML alone never includes these blobs.
 * @param {string} html
 * @param {string} threadUrl
 * @returns {number} ms
 */
function updatedTimeMsNearThreadPath(html, threadUrl) {
  const key = extractMessengerThreadKeyFromUrl(threadUrl);
  if (!key || !html) return 0;

  const encoded = encodeURIComponent(key);
  /** @type {string[]} */
  const needles = [];
  needles.push(`/messages/t/${key}`);
  needles.push(`/messages/e2ee/t/${key}`);
  needles.push(`/t/${key}`);
  if (encoded !== key) {
    needles.push(`/messages/t/${encoded}`);
    needles.push(`/messages/e2ee/t/${encoded}`);
    needles.push(`/t/${encoded}`);
  }
  // www. and m. variants sometimes appear in JSON URIs
  needles.push(`facebook.com/messages/t/${key}`);
  needles.push(`facebook.com/messages/e2ee/t/${key}`);
  needles.push(`messenger.com/t/${key}`);

  const uniq = [...new Set(needles)].filter((n) => n.length >= 8);
  let best = 0;
  for (const needle of uniq) {
    let pos = 0;
    while (true) {
      const i = html.indexOf(needle, pos);
      if (i < 0) break;
      const slice = html.slice(Math.max(0, i - 14000), i + 18000);
      const re = /"updated_time"\s*:\s*(\d+)/g;
      let m;
      while ((m = re.exec(slice)) !== null) {
        const n = Number(m[1]);
        if (!Number.isFinite(n) || n < MIN_UPDATED_TIME_S || n > MAX_UPDATED_TIME_S) continue;
        const ms = coerceDeliveredAtToMs(n);
        if (ms > best) best = ms;
      }
      pos = i + needle.length;
    }
  }
  return best;
}

/**
 * For numeric thread ids, find JSON nodes with matching thread_fbid and read nearby updated_time.
 * @param {string} html
 * @param {string} threadId numeric only
 * @returns {number} ms
 */
function updatedTimeMsNearThreadFbid(html, threadId) {
  if (!html || !/^\d+$/.test(threadId)) return 0;
  const needles = [`"thread_fbid":"${threadId}"`, `"thread_fbid": "${threadId}"`];
  let best = 0;
  for (const needle of needles) {
    let pos = 0;
    while (true) {
      const i = html.indexOf(needle, pos);
      if (i < 0) break;
      const slice = html.slice(i, i + 20000);
      const re = /"updated_time"\s*:\s*(\d+)/g;
      let m;
      while ((m = re.exec(slice)) !== null) {
        const n = Number(m[1]);
        if (!Number.isFinite(n) || n < MIN_UPDATED_TIME_S || n > MAX_UPDATED_TIME_S) continue;
        const ms = coerceDeliveredAtToMs(n);
        if (ms > best) best = ms;
      }
      pos = i + needle.length;
    }
  }
  return best;
}

/**
 * Best-effort last-activity time for the open thread (for cross-network "latest conversation").
 * @param {string} html full document HTML (script JSON included)
 * @param {string} threadUrl
 * @returns {number} ms since epoch, or 0
 */
export function extractFacebookThreadUpdatedAtMsFromHtml(html, threadUrl) {
  const key = extractMessengerThreadKeyFromUrl(threadUrl);
  if (!key || !html) return 0;
  const htmlStr = String(html);

  if (/^\d+$/.test(key)) {
    const precise = updatedTimeMsNearThreadFbid(htmlStr, key);
    if (precise > 0) return precise;
  }

  const nearPath = updatedTimeMsNearThreadPath(htmlStr, threadUrl);
  if (nearPath > 0) return nearPath;

  // Last resort: max updated_time on page (may prefer a different sidebar thread).
  return maxUpdatedTimeMsInHtml(htmlStr);
}
