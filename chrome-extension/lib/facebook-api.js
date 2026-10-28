/**
 * Facebook: friends sync (GraphQL) + shared cookie helpers.
 * Friends list: **background only** — service worker `fetch` with `credentials: 'include'`.
 * (1) Prefer GET `https://www.facebook.com/friends/list` and parse `<script type="application/json" data-sjs>`
 * payloads for `direct_nav_result.type === "FRIEND"` (search/bootstrap graph embedded in the page).
 * (2) Else GET HTML for `fb_dtsg` / `__hsdp`, then POST `https://www.facebook.com/api/graphql/`.
 * No visible or inactive tabs for friends sync (Messenger / other features use their own modules).
 * Messenger thread URL from profile HTML lives in facebook-bulk-messaging-url.js.
 */

const LOG = (...args) => console.log('[PRM facebook-api]', ...args);

/** Persisted query id verified against a minimal working curl (friends list). */
const FB_MINIMAL_FRIENDS_DOC_ID = '25955120204098652';

function matchOne(text, regex) {
  const m = text.match(regex);
  return m ? m[1] : null;
}

function normalizeFacebookProfileUrl(raw) {
  if (!raw) return '';
  if (typeof raw !== 'string') raw = String(raw);
  if (raw.startsWith('https://www.facebook.com/')) return raw.split('?')[0].replace(/\/+$/, '');
  if (/^\d+$/.test(raw)) return `https://www.facebook.com/profile.php?id=${raw}`;
  if (raw.startsWith('/')) return `https://www.facebook.com${raw}`.split('?')[0].replace(/\/+$/, '');
  return '';
}

function parseFacebookGraphQLData(data) {
  const contacts = [];
  let nextCursor = null;
  const stack = [data];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    if (node.page_info && (node.page_info.end_cursor || node.page_info.has_next_page)) {
      if (node.page_info.end_cursor) nextCursor = node.page_info.end_cursor;
    }
    if (node.name && (node.url || node.uri || node.profile_url || node.id || node.profileOwnerId)) {
      const profileUrl = normalizeFacebookProfileUrl(node.url || node.uri || node.profile_url || node.id);
      if (profileUrl) {
        const commonFriends =
          node.mutual_friends_count ?? node.common_friends_count ?? node.num_mutual_friends ?? node.mutualFriends?.count;
        const contact = { name: String(node.name), profileUrl };
        if (typeof commonFriends === 'number' && commonFriends >= 0) contact.commonFriendCount = commonFriends;
        contacts.push(contact);
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  if (contacts.length === 0) {
    try {
      const json = JSON.stringify(data);
      const urls = json.match(/https:\/\/www\.facebook\.com\/profile\.php\?id=\d+|https:\/\/www\.facebook\.com\/[a-zA-Z0-9.]+/g) || [];
      for (const url of urls) {
        const clean = url.split('?')[0].replace(/\/+$/, '');
        if (clean) contacts.push({ name: '', profileUrl: clean });
      }
    } catch (_) {}
  }
  return { contacts, nextCursor };
}

/**
 * JSON string values in page HTML may contain `\u003a` escapes; regex `([^"]*)` leaves them as literal
 * backslash + `u003a` until wrapped and JSON.parse'd.
 */
function decodeJsonStringInner(raw) {
  if (!raw || typeof raw !== 'string') return '';
  try {
    return JSON.parse('"' + raw.replace(/"/g, '\\"').replace(/\r?\n/g, '\\n') + '"');
  } catch {
    return raw;
  }
}

/**
 * Apply URL decoding until stable (HTML often stores %3A456%2C479…; working POST uses decoded blob gkkJ…).
 */
function fullyUrlDecodeHsdpSegment(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.replace(/\+/g, ' ');
  for (let i = 0; i < 6; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(s)) break;
    try {
      const next = decodeURIComponent(s);
      if (next === s) break;
      s = next;
    } catch {
      break;
    }
  }
  return s;
}

/**
 * Module-id list shape (`:456,479,…` or the same as percent-encoded in JSON). Not the Comet blob `gkkJ…`.
 */
function isHsdpModuleListShape(decoded) {
  if (!decoded || typeof decoded !== 'string') return true;
  const t = decoded.trim();
  if (/^:[\d,]/.test(t)) return true;
  if (/^:[\d,:]+$/.test(t) && t.includes(',')) return true;
  return false;
}

/** Comet blobs are long and letter-rich; module-id lists are mostly digits, commas, colons, `%`. */
function hsdpLetterRatio(decoded) {
  if (!decoded || typeof decoded !== 'string') return 0;
  const t = decoded.replace(/\s/g, '');
  if (t.length < 1) return 0;
  return (t.match(/[a-zA-Z]/g) || []).length / t.length;
}

/**
 * When every `"__hsdp":"…"` decodes to something `isHsdpModuleListShape` still flags (FB HTML quirk),
 * pick the longest segment that **cannot** be a pure module list and has enough letters to be a blob.
 */
function pickHsdpByLetterHeuristic(scored) {
  let best = null;
  let bestScore = -1;
  for (const { decoded } of scored) {
    const t = decoded.trim();
    if (t.length < 400) continue;
    if (/^:[\d,]/.test(t)) continue;
    const ratio = hsdpLetterRatio(t);
    if (ratio < 0.06) continue;
    const score = t.length * (0.35 + ratio);
    if (score > bestScore) {
      bestScore = score;
      best = decoded;
    }
  }
  return best;
}

function extractAllHsdpCandidates(html) {
  if (!html || typeof html !== 'string') return [];
  const out = [];
  const re = /"__hsdp":"([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].length > 0) out.push(m[1]);
  }
  return out;
}

/**
 * Some bundles use URL-encoded JSON keys: `__hsdp%22%3A%22` + percent-encoded blob + `%22`.
 * Home HTML often only has list-shaped `"__hsdp":"` values; the Comet blob may appear only here or on /friends/list.
 */
function extractHsdpFromUrlEncodedJsonKey(html) {
  if (!html || typeof html !== 'string') return null;
  const needle = '__hsdp%22%3A%22';
  let pos = 0;
  let best = null;
  let bestLen = 0;
  while (true) {
    const i = html.indexOf(needle, pos);
    if (i < 0) break;
    const start = i + needle.length;
    const end = html.indexOf('%22', start);
    if (end < 0) {
      pos = start + 1;
      continue;
    }
    const enc = html.slice(start, end);
    pos = end + 3;
    try {
      const raw = decodeURIComponent(enc.replace(/\+/g, ' '));
      const dec = fullyUrlDecodeHsdpSegment(decodeJsonStringInner(raw));
      if (
        dec.length > bestLen &&
        dec.length > 400 &&
        hsdpLetterRatio(dec) > 0.08 &&
        !isHsdpModuleListShape(dec)
      ) {
        bestLen = dec.length;
        best = dec;
      }
    } catch {
      /* ignore */
    }
  }
  return best;
}

/**
 * Doubled backslash before `\u0022` (string-embedded JSON): `\\u0022__hsdp\\u0022:\\u0022` + blob + `\\u0022`.
 */
function extractHsdpFromDoubleEscapedUnicodeJsonKey(html) {
  if (!html || typeof html !== 'string') return null;
  const bs = '\u005c';
  const open = `${bs}${bs}u0022__hsdp${bs}${bs}u0022:${bs}${bs}u0022`;
  const close = `${bs}${bs}u0022`;
  let pos = 0;
  let best = null;
  let bestLen = 0;
  while (true) {
    const i = html.indexOf(open, pos);
    if (i < 0) break;
    const start = i + open.length;
    const end = html.indexOf(close, start);
    if (end < 0) {
      pos = start + 1;
      continue;
    }
    const raw = html.slice(start, end);
    pos = end + close.length;
    try {
      const dec = fullyUrlDecodeHsdpSegment(decodeJsonStringInner(raw));
      if (
        dec.length > bestLen &&
        dec.length > 400 &&
        hsdpLetterRatio(dec) > 0.08 &&
        !isHsdpModuleListShape(dec)
      ) {
        bestLen = dec.length;
        best = dec;
      }
    } catch {
      /* ignore */
    }
  }
  return best;
}

/**
 * Script bundles sometimes use Unicode-escaped JSON quotes: `\u0022__hsdp\u0022:\u0022` + blob + `\u0022`.
 * SW-fetched HTML can expose this while plain `"__hsdp":"` values stay list-shaped.
 */
function extractHsdpFromJsUnicodeQuotedKey(html) {
  if (!html || typeof html !== 'string') return null;
  const marker = '\\u0022__hsdp\\u0022:\\u0022';
  let pos = 0;
  let best = null;
  let bestLen = 0;
  while (true) {
    const i = html.indexOf(marker, pos);
    if (i < 0) break;
    const start = i + marker.length;
    const end = html.indexOf('\\u0022', start);
    if (end < 0) {
      pos = start + 1;
      continue;
    }
    const raw = html.slice(start, end);
    pos = end + 6;
    try {
      const dec = fullyUrlDecodeHsdpSegment(decodeJsonStringInner(raw));
      if (
        dec.length > bestLen &&
        dec.length > 400 &&
        hsdpLetterRatio(dec) > 0.08 &&
        !isHsdpModuleListShape(dec)
      ) {
        bestLen = dec.length;
        best = dec;
      }
    } catch {
      /* ignore */
    }
  }
  return best;
}

/**
 * Pick the **fully URL-decoded** blob that matches a working browser POST (long alnum-ish token), not the hsdp “list” segment.
 */
function extractBestHsdpFromHtml(html) {
  const doubleUnicodeBlob = extractHsdpFromDoubleEscapedUnicodeJsonKey(html);
  if (doubleUnicodeBlob) {
    LOG('extractBestHsdpFromHtml: using __hsdp from \\\\u0022-doubled JSON key');
    return doubleUnicodeBlob;
  }

  const unicodeBlob = extractHsdpFromJsUnicodeQuotedKey(html);
  if (unicodeBlob) {
    LOG('extractBestHsdpFromHtml: using __hsdp from \\u0022-escaped JSON key');
    return unicodeBlob;
  }

  const urlEncBlob = extractHsdpFromUrlEncodedJsonKey(html);
  if (urlEncBlob) {
    LOG('extractBestHsdpFromHtml: using __hsdp from URL-encoded JSON key fragment');
    return urlEncBlob;
  }

  const rawCandidates = extractAllHsdpCandidates(html);
  if (!rawCandidates.length) return null;

  const scored = rawCandidates.map((raw) => {
    const decoded = fullyUrlDecodeHsdpSegment(decodeJsonStringInner(raw));
    return { raw, decoded, list: isHsdpModuleListShape(decoded) };
  });

  const blobs = scored.filter((x) => !x.list);
  if (!blobs.length) {
    const fallback = pickHsdpByLetterHeuristic(scored);
    if (fallback) {
      LOG('extractBestHsdpFromHtml: using letter-heuristic __hsdp (strict list filter matched all candidates)');
      return fallback;
    }

    LOG('extractBestHsdpFromHtml: only list-shaped __hsdp after URL decode (need Comet blob)');
    return null;
  }

  blobs.sort((a, b) => b.decoded.length - a.decoded.length);
  const best = blobs[0];
  if (!best?.decoded) return null;

  return best.decoded;
}

/** Tokens parsed from HTML (fb_dtsg required for minimal GraphQL; lsd optional). */
function extractTokensFromHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const fb_dtsg =
    matchOne(html, /"DTSGInitialData",\[\],\{\\"token\\":\\"([^"]+)\\"\}/) ||
    matchOne(html, /"DTSGInitialData",\[\],\{\"token\":\"([^\"]+)\"/) ||
    matchOne(html, /name="fb_dtsg" value="([^"]+)"/) ||
    matchOne(html, /name=&quot;fb_dtsg&quot; value=&quot;([^&]+)&quot;/) ||
    matchOne(html, /"fb_dtsg"\s*:\s*"([^"]+)"/) ||
    matchOne(html, /\["DTSGInitialData",\[\],\{"token":"([^"]+)"\}/);
  const lsd =
    matchOne(html, /"LSD",\[\],\{\\"token\\":\\"([^"]+)\\"\}/) ||
    matchOne(html, /"LSD",\[\],\{\"token\":\"([^\"]+)\"/) ||
    matchOne(html, /name="lsd" value="([^"]+)"/) ||
    matchOne(html, /name=&quot;lsd&quot; value=&quot;([^&]+)&quot;/) ||
    matchOne(html, /"lsd"\s*:\s*"([^"]+)"/);
  let userId =
    matchOne(html, /"USER_ID":"(\d+)"/) ||
    matchOne(html, /"ACCOUNT_ID":"(\d+)"/) ||
    matchOne(html, /"actorID":"(\d+)"/) ||
    matchOne(html, /\bav=(\d+)\b/) ||
    matchOne(html, /\b__user=(\d+)\b/);
  if (userId === '0' || userId === '') userId = null;
  const rev =
    matchOne(html, /\b__spin_r=(\d+)/) ||
    matchOne(html, /\b__rev=(\d+)/) ||
    matchOne(html, /"__rev"\s*:\s*(\d+)/) ||
    matchOne(html, /"__spin_r"\s*:\s*(\d+)/);
  const hsi =
    matchOne(html, /\b__hsi=(\d+)/) ||
    matchOne(html, /\"__hsi\":\"(\d+)\"/) ||
    matchOne(html, /"__hsi"\s*:\s*(\d+)/) ||
    matchOne(html, /\\"__hsi\\":\\"(\d+)\\"/) ||
    matchOne(html, /\\"__hsi\\":(\d+)/) ||
    null;
  const spin_r = matchOne(html, /\b__spin_r=(\d+)/) || rev;
  const spin_t = matchOne(html, /\b__spin_t=(\d+)/) || String(Math.floor(Date.now() / 1000));
  return { fb_dtsg, lsd, userId, rev, hsi, spin_r, spin_t };
}

export function getTokensFromHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const tok = extractTokensFromHtml(html);
  if (!tok.fb_dtsg) return null;
  return {
    fb_dtsg: tok.fb_dtsg,
    lsd: tok.lsd || '',
    userId: tok.userId || '',
    rev: tok.rev || '',
    hsi: tok.hsi || '',
    spin_r: tok.spin_r || tok.rev || '',
    spin_t: tok.spin_t || String(Math.floor(Date.now() / 1000)),
    spin_b: 'trunk',
  };
}

/**
 * Minimal Cookie header for Facebook requests: **only** `c_user` and `xs`, like:
 * `curl -b 'c_user=…; xs=…;'`
 * Values come from `chrome.cookies` (www + apex merged so either domain works).
 */
export async function getFacebookMinimalCookieHeader() {
  try {
    const [www, apex] = await Promise.all([
      chrome.cookies.getAll({ url: 'https://www.facebook.com' }),
      chrome.cookies.getAll({ url: 'https://facebook.com' }),
    ]);
    const byName = Object.fromEntries([...www, ...apex].map((c) => [c.name, c.value]));
    const parts = [];
    if (byName.c_user) parts.push(`c_user=${byName.c_user}`);
    if (byName.xs) parts.push(`xs=${byName.xs}`);
    return parts.join('; ');
  } catch (e) {
    LOG('getFacebookMinimalCookieHeader: error', e?.message || e);
    return '';
  }
}

/**
 * Full `Cookie` header like `curl -b` — all facebook.com cookies (www + apex merged).
 * Matches a logged-in browser session (sb, datr, c_user, xs, fr, presence, …).
 */
export async function getFacebookFullCookieHeader() {
  try {
    const [www, apex] = await Promise.all([
      chrome.cookies.getAll({ url: 'https://www.facebook.com' }),
      chrome.cookies.getAll({ url: 'https://facebook.com' }),
    ]);
    const byName = new Map();
    for (const c of [...www, ...apex]) {
      byName.set(c.name, c.value);
    }
    return Array.from(byName.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  } catch (e) {
    LOG('getFacebookFullCookieHeader: error', e?.message || e);
    return '';
  }
}

/**
 * Prefer full cookie jar; fall back to c_user + xs only.
 */
export async function getFacebookCookieHeaderForDocumentFetch() {
  const full = (await getFacebookFullCookieHeader()).trim();
  if (full) return full;
  return (await getFacebookMinimalCookieHeader()).trim();
}

async function getFacebookCUserFromCookies() {
  try {
    const [www, apex] = await Promise.all([
      chrome.cookies.getAll({ url: 'https://www.facebook.com' }),
      chrome.cookies.getAll({ url: 'https://facebook.com' }),
    ]);
    const byName = Object.fromEntries([...www, ...apex].map((c) => [c.name, c.value]));
    return typeof byName.c_user === 'string' ? byName.c_user.trim() : '';
  } catch {
    return '';
  }
}

/** Which named cookies exist in the jar (booleans only — no values). For debugging vs curl `c_user`+`xs`+`presence`. */
async function getFacebookCookieJarFlags() {
  try {
    const [www, apex] = await Promise.all([
      chrome.cookies.getAll({ url: 'https://www.facebook.com' }),
      chrome.cookies.getAll({ url: 'https://facebook.com' }),
    ]);
    const names = new Set([...www, ...apex].map((c) => c.name));
    return {
      hasCUser: names.has('c_user'),
      hasXs: names.has('xs'),
      hasFr: names.has('fr'),
      hasPresence: names.has('presence'),
    };
  } catch {
    return { hasCUser: false, hasXs: false, hasFr: false, hasPresence: false };
  }
}

/**
 * Navigation-style GET to a facebook.com HTML document (matches working browser `curl`).
 * Use with `credentials: 'include'` (browser sends cookies; do not set `Cookie` in fetch headers).
 * {@link getFacebookCookieHeaderForDocumentFetch} is only for probing/logging that a jar exists.
 */
export const FACEBOOK_CURL_LIKE_GET_HEADERS = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  DPR: '2',
  Pragma: 'no-cache',
  Priority: 'u=0, i',
  'Sec-CH-Prefers-Color-Scheme': 'light',
  'Sec-CH-UA': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
  'Sec-CH-UA-Full-Version-List':
    '"Not:A-Brand";v="99.0.0.0", "Google Chrome";v="145.0.7632.117", "Chromium";v="145.0.7632.117"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Model': '""',
  'Sec-CH-UA-Platform': '"macOS"',
  'Sec-CH-UA-Platform-Version': '"26.3.0"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  'Viewport-Width': '1440',
};

/**
 * Last-resort HTML bootstrap from the service worker. Do **not** send `Origin`/`Referer` as facebook.com —
 * that can produce an empty body from extension-initiated fetches. Use navigation-like Accept + UA only.
 */
async function fetchFacebookBootstrapDocumentFromServiceWorker(url = 'https://www.facebook.com/') {
  LOG(
    'facebook-request: goal=',
    'SW bootstrap GET (no fake Origin; cookies via credentials:include)',
    '| url=',
    url,
  );
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      Accept: FACEBOOK_CURL_LIKE_GET_HEADERS.Accept,
      'Accept-Language': FACEBOOK_CURL_LIKE_GET_HEADERS['Accept-Language'],
      'User-Agent': FACEBOOK_CURL_LIKE_GET_HEADERS['User-Agent'],
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  let text = await res.text();
  if (text.startsWith('for (;;);')) text = text.slice(9);
  LOG(
    'fetchFacebookBootstrapDocumentFromServiceWorker: status=',
    res.status,
    'finalUrl=',
    res.url,
    'bodyLen=',
    text.length,
  );
  return { body: text, status: res.status, url: res.url };
}

/**
 * Walk Comet/Relay JSON from `friends/list` SJS blocks for entity rows with `direct_nav_result.type === "FRIEND"`.
 * Skips shortcuts (`SHORTCUT`), Marketplace rows, and the viewer row (`snippet === "You"`).
 * @param {string} html
 * @returns {Array<{ name: string, profileUrl: string }>}
 */
export function extractFacebookFriendsFromFriendsListSjsHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1];
    if (!/\btype\s*=\s*["']application\/json["']/i.test(attrs)) continue;
    if (!/\bdata-sjs\b/i.test(attrs)) continue;
    const raw = m[2].trim();
    if (raw.length < 20) continue;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    collectFacebookFriendsFromSjsTree(data, out, seen);
  }
  return out;
}

function collectFacebookFriendsFromSjsTree(node, out, seen) {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const x of node) collectFacebookFriendsFromSjsTree(x, out, seen);
    return;
  }
  if (typeof node !== 'object') return;
  const dn = node.direct_nav_result;
  if (dn && typeof dn === 'object') {
    const typ = String(dn.type || '').toUpperCase();
    if (typ === 'FRIEND' && dn.link_url && dn.title && String(dn.snippet || '').trim() !== 'You') {
      const profileUrl = normalizeFacebookProfileUrl(String(dn.link_url));
      if (profileUrl) {
        const key = profileUrl.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ name: String(dn.title).trim(), profileUrl });
        }
      }
    }
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') collectFacebookFriendsFromSjsTree(v, out, seen);
  }
}

/**
 * GET friends/list in the service worker and parse embedded `data-sjs` JSON for friend rows.
 * @returns {Promise<{ success: boolean, contacts: Array<{ name: string, profileUrl: string }>, status: number, rawBodyLen: number }>}
 */
export async function facebookTryFetchFriendsFromFriendsListPageSjs() {
  const url = 'https://www.facebook.com/friends/list';
  const { body, status } = await fetchFacebookBootstrapDocumentFromServiceWorker(url);
  const text = body || '';
  const contacts = extractFacebookFriendsFromFriendsListSjsHtml(text);
  return { success: contacts.length > 0, contacts, status, rawBodyLen: text.length };
}

/**
 * POST /api/graphql/ with **only** `__hsdp`, `fb_dtsg`, `doc_id` (same field order as curl).
 * `curl --data-raw` sends `__hsdp` literally (no percent-encoding); `URLSearchParams` would encode
 * `:` `,` etc. Use a raw `__hsdp` segment and encode only `fb_dtsg` (e.g. `%3A` for `:`), matching a working browser.
 */
function buildMinimalFriendsGraphQLBody(session) {
  const hsdp = String(session.__hsdp ?? '');
  const dtsg = encodeURIComponent(String(session.fb_dtsg ?? ''));
  const doc = String(FB_MINIMAL_FRIENDS_DOC_ID);
  return `__hsdp=${hsdp}&fb_dtsg=${dtsg}&doc_id=${doc}`;
}

function tryParseFacebookSessionFromHtml(html, source) {
  const session = getTokensFromHtml(html);
  if (!session) {
    LOG('tryParseFacebookSessionFromHtml: no fb_dtsg', source);
    return null;
  }
  const __hsdp = extractBestHsdpFromHtml(html);
  if (!__hsdp) {
    LOG('tryParseFacebookSessionFromHtml: no __hsdp blob', source);
    return null;
  }
  session.__hsdp = __hsdp;
  return session;
}

/** HTML document URLs to try (background GET) until `fb_dtsg` + blob `__hsdp` parse. */
const FACEBOOK_SW_BOOTSTRAP_URLS = [
  'https://www.facebook.com/friends/list',
  'https://www.facebook.com/friends',
  'https://www.facebook.com/',
];

export async function facebookInitTokensWithCredentials() {
  let lastHtml = '';

  /** Friends list is fetched only via POST /api/graphql/; HTML is only for extracting `fb_dtsg` + blob `__hsdp`. */
  const finishInit = async (session, body, tokenSource) => {
    if (!session.userId) {
      const cUser = await getFacebookCUserFromCookies();
      if (cUser && /^\d+$/.test(cUser)) session.userId = cUser;
    }

    const hsdpKind = isHsdpModuleListShape(session.__hsdp) ? 'list' : 'blob';

    return { success: true, tokens: session };
  };

  for (const bootstrapUrl of FACEBOOK_SW_BOOTSTRAP_URLS) {
    LOG('facebookInitTokensWithCredentials: background GET', bootstrapUrl);
    const { body, status } = await fetchFacebookBootstrapDocumentFromServiceWorker(bootstrapUrl);
    lastHtml = body;
    if (status !== 200) continue;
    const session = tryParseFacebookSessionFromHtml(body, `sw-bootstrap`);
    if (session) {
      let tokenSource = 'sw-bootstrap-home';
      if (/\/friends\/list/i.test(bootstrapUrl)) tokenSource = 'sw-bootstrap-friends-list';
      else if (/\/friends\/?$/i.test(bootstrapUrl.replace(/\/$/, ''))) tokenSource = 'sw-bootstrap-friends-hub';
      return await finishInit(session, body, tokenSource);
    }
  }

  const isLoginPage = /login|sign in|log in|continue as/i.test(lastHtml);
  return {
    success: false,
    error: isLoginPage
      ? 'Not logged in to Facebook. Sign in at facebook.com in this browser.'
      : 'Could not read Facebook session (__hsdp or fb_dtsg) via background fetch. Stay logged in at facebook.com and try again.',
  };
}

export async function facebookFetchFriendsPageWithCredentials(session, { cursor = null, count = 30 } = {}) {
  void count;
  if (cursor) {
    LOG('facebookFetchFriendsPageWithCredentials: minimal GraphQL has no pagination body; skipping page');
    return { success: true, contacts: [], nextCursor: null };
  }
  if (!session?.__hsdp || !session?.fb_dtsg) {
    return { success: false, error: 'Missing __hsdp or fb_dtsg', contacts: [], nextCursor: null };
  }

  const body = buildMinimalFriendsGraphQLBody(session);
  const graphqlUrl = 'https://www.facebook.com/api/graphql/';
  LOG('facebookFetchFriendsPageWithCredentials: background POST', graphqlUrl, 'doc_id=', FB_MINIMAL_FRIENDS_DOC_ID);

  const jarBeforeGraphql = await getFacebookCookieJarFlags();
  const hsdpKind = isHsdpModuleListShape(session.__hsdp) ? 'list' : 'blob';

  const res = await fetch(graphqlUrl, {
    method: 'POST',
    credentials: 'include',
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.facebook.com/',
      'User-Agent': FACEBOOK_CURL_LIKE_GET_HEADERS['User-Agent'],
    },
    body,
  });
  const status = res.status;
  let text = await res.text();
  if (text.startsWith('for (;;);')) text = text.slice(9);
  LOG('facebookFetchFriendsPageWithCredentials: GraphQL background fetch; status', status, 'body length', text?.length);

  if (!text?.length) {
    LOG('facebookFetchFriendsPageWithCredentials: empty GraphQL body; cookie jar flags=', jarBeforeGraphql);
  }

  return parseGraphQLResponse(text);
}

export function parseGraphQLResponse(bodyText) {
  if (!bodyText || typeof bodyText !== 'string') {
    return { success: false, error: 'Empty response', contacts: [], nextCursor: null };
  }
  const clean = bodyText.replace(/^for \(;;\);/, '');
  let data;
  try {
    data = JSON.parse(clean);
  } catch {
    return { success: false, error: 'Invalid JSON', contacts: [], nextCursor: null };
  }
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    const msg = data.errors[0].message || 'Facebook API error';
    return { success: false, error: msg, contacts: [], nextCursor: null };
  }
  if ((data?.errorSummary || data?.errorDescription || data?.error || data?.message) && !data?.data) {
    const msg =
      data?.errorSummary ||
      data?.errorDescription ||
      data?.error?.message ||
      data?.message ||
      'Facebook GraphQL error';
    return { success: false, error: String(msg), contacts: [], nextCursor: null };
  }
  const { contacts } = parseFacebookGraphQLData(data);
  return { success: true, contacts, nextCursor: null };
}
