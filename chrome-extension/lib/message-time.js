/**
 * Normalize message delivery time to ms for cross-network "latest exchange" comparison.
 * @param {number|string|null|undefined} d
 * @returns {number} ms since epoch, or 0 if unknown
 */
export function coerceDeliveredAtToMs(d) {
  if (d == null || d === '') return 0;
  if (typeof d === 'number' && Number.isFinite(d)) {
    // Heuristic: values before year ~2001 in ms are usually Unix seconds (some APIs).
    if (d > 0 && d < 1e12) return Math.floor(d * 1000);
    return d;
  }
  const p = Date.parse(String(d));
  return Number.isFinite(p) ? p : 0;
}

/**
 * Newest activity time in a chronological recent-messages array (oldest → newest).
 * @param {Array<{ deliveredAt?: number|string|null }>} recentMessages
 * @returns {number}
 */
export function latestExchangeMsFromRecentMessages(recentMessages) {
  let max = 0;
  for (const m of recentMessages || []) {
    const t = coerceDeliveredAtToMs(m?.deliveredAt);
    if (t > max) max = t;
  }
  return max;
}
