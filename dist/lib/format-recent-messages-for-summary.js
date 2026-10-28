/**
 * Format oldest→newest message rows for the thread summarizer (any platform).
 * Must stay in sync with what is sent to WEBLLM_SUMMARIZE_MESSAGE.
 * @param {Array<{ text?: string, fromName?: string }>} recentMessages
 * @returns {string}
 */
export function formatRecentMessagesForSummary(recentMessages) {
  if (!Array.isArray(recentMessages) || recentMessages.length === 0) return '';
  return recentMessages
    .map((m, i) => {
      const t = (m.text || '').trim();
      const who = (m.fromName || '').trim();
      const label = who ? ` (${who})` : '';
      return `Message ${i + 1}${label}: ${t}`;
    })
    .join('\n');
}
