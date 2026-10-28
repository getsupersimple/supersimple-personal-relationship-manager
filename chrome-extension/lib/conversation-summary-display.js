/**
 * Display formatting for contact.conversationSummary + conversationSummaryPlatform.
 * @param {string} [platform]
 * @returns {string}
 */
export function conversationSummaryPlatformLabel(platform) {
  if (!platform || typeof platform !== 'string') return '';
  const key = platform.trim().toLowerCase();
  const map = {
    linkedin: 'LinkedIn',
    facebook: 'Facebook',
    gmail: 'Gmail',
    whatsapp: 'WhatsApp',
  };
  if (map[key]) return map[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * One line for contact detail, popup preview, search text helpers.
 * @param {{ conversationSummary?: string, conversationSummaryPlatform?: string }} contact
 * @returns {string}
 */
export function conversationSummaryDisplayLine(contact) {
  const s = (contact?.conversationSummary || '').trim();
  if (!s) return '';
  const label = conversationSummaryPlatformLabel(contact?.conversationSummaryPlatform);
  return label ? `${label} — ${s}` : s;
}
