/**
 * Shared LinkedIn profile URL normalization (used by dedup, pagination, processor).
 * Strips protocol, www, query, hash, trailing slashes, and UI locale segments.
 * @param {string} url
 * @returns {string}
 */
export function normalizeLinkedInProfileUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let u = url.trim();
  u = u.replace(/^https?:\/\/(www\.)?/i, '');
  const q = u.indexOf('?');
  if (q >= 0) u = u.slice(0, q);
  const h = u.indexOf('#');
  if (h >= 0) u = u.slice(0, h);
  u = u.replace(/\/+$/, '');
  const loc = /^(.+\/in\/[^/]+)\/(en|es|fr|de|pt|pt-br|it|nl|ja|ko|zh-cn|zh-tw|ar|in|tr|pl|sv|da|no|fi|th|vi|uk|he|id|ms|ro|cs|hu|el|tl)$/i;
  for (let i = 0; i < 3; i++) {
    const m = u.match(loc);
    if (!m) break;
    u = m[1].replace(/\/+$/, '');
  }
  return u;
}
