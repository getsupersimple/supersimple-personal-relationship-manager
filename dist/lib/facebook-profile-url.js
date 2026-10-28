/**
 * Canonical Facebook profile identity for dedup and contact IDs.
 * Must preserve profile.php?id= — stripping ?id collapses most users to one URL.
 */

/**
 * @param {string} url
 * @returns {string} Host+path form without scheme, e.g. facebook.com/profile.php?id=123 or facebook.com/username
 */
export function normalizeFacebookProfileUrlKey(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    let host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (!host.endsWith('facebook.com') && !host.endsWith('fb.com')) return '';
    const path = (u.pathname || '').replace(/\/+$/, '') || '/';
    if (path === '/profile.php' || path.endsWith('/profile.php')) {
      const id = u.searchParams.get('id');
      if (id && String(id).trim()) {
        return `${host}/profile.php?id=${encodeURIComponent(String(id).trim())}`;
      }
      return `${host}/profile.php`;
    }
    if (/^\/people\/[^/]+$/i.test(path)) {
      return `${host}${path}`.toLowerCase();
    }
    const segs = path.split('/').filter(Boolean);
    if (segs.length === 1 && /^[a-zA-Z0-9.]{2,}$/.test(segs[0])) {
      return `${host}/${segs[0]}`.toLowerCase();
    }
    return `${host}${path}`.toLowerCase();
  } catch {
    return '';
  }
}
