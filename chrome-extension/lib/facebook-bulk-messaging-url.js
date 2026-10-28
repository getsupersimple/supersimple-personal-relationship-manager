/**
 * Messenger thread URL from profile HTML only:
 * GET the profile with navigation-style headers; session cookies are sent by the browser
 * (`credentials: 'include'`). We only use getFacebookCookieHeaderForDocumentFetch() to
 * verify a jar exists — manual `Cookie` headers are not sent (forbidden in fetch).
 *
 * No bulk-route POST or JSON graph walk.
 */
import {
  getFacebookCookieHeaderForDocumentFetch,
  FACEBOOK_CURL_LIKE_GET_HEADERS,
} from './facebook-api.js';

/** Log what we want and which URL we hit (before each fetch). */
function logFacebookHttpRequest(log, goal, url) {
  (log || (() => {}))('facebook-request: goal=', goal, '| url=', url);
}

/**
 * Segment after /messages/t/ or /messages/e2ee/t/: numeric thread id (10–22 digits) or username slug
 * (e.g. christian.bach.1977). Matches JSON-escaped URLs in profile HTML.
 */
const FB_MSG_THREAD_SEG =
  '(\\d{10,22}|[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?)';

/**
 * Find Messenger thread id in profile HTML by URL substring (Facebook embeds JSON-escaped URIs).
 * @returns {{ threadId: string, e2ee: boolean, messagingUrl: string } | null}
 */
function extractMessengerThreadFromUrlPatterns(html) {
  if (!html || typeof html !== 'string') return null;

  /** Order: prefer e2ee path; JSON-escaped `https:\/\/www.facebook.com\/messages\/e2ee\/t\/` first */
  const patterns = [
    new RegExp(
      `https:\\\\/\\\\/www\\.facebook\\.com\\\\/messages\\\\/e2ee\\\\/t\\\\/${FB_MSG_THREAD_SEG}`,
    ),
    new RegExp(`https:\\/\\/www\\.facebook\\.com\\/messages\\/e2ee\\/t\\/${FB_MSG_THREAD_SEG}`),
    new RegExp(
      `https:\\\\/\\\\/www\\.facebook\\.com\\\\/messages\\\\/t\\\\/${FB_MSG_THREAD_SEG}`,
    ),
    new RegExp(`https:\\/\\/www\\.facebook\\.com\\/messages\\/t\\/${FB_MSG_THREAD_SEG}`),
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const threadId = m[1];
      const e2ee = m[0].includes('e2ee');
      const messagingUrl = buildFacebookMessagesUrl(threadId, e2ee);
      if (messagingUrl) return { threadId, e2ee, messagingUrl };
    }
  }
  return null;
}

/**
 * Build canonical Messenger thread URL from numeric thread id or username slug.
 * E2EE threads use /messages/e2ee/t/{id}; standard threads use /messages/t/{id}.
 */
export function buildFacebookMessagesUrl(threadId, e2ee) {
  const raw = String(threadId ?? '').trim();
  if (!raw) return '';

  if (/^\d{10,22}$/.test(raw)) {
    return e2ee
      ? `https://www.facebook.com/messages/e2ee/t/${raw}`
      : `https://www.facebook.com/messages/t/${raw}`;
  }

  /** Vanity username / slug (must not look like a short numeric id we rejected above) */
  if (/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(raw) && raw.length <= 128) {
    return e2ee
      ? `https://www.facebook.com/messages/e2ee/t/${raw}`
      : `https://www.facebook.com/messages/t/${raw}`;
  }

  return '';
}

/**
 * Extract Messenger thread id from profile HTML via Messenger URL patterns.
 *
 * @returns {{ threadId: string, e2ee: boolean, messagingUrl: string } | null}
 */
export function extractMessengerThreadFromProfileHtml(html) {
  return extractMessengerThreadFromUrlPatterns(html);
}

async function fetchProfileHtml(profileUrl, log) {
  const cookieProbe = (await getFacebookCookieHeaderForDocumentFetch()).trim();
  logFacebookHttpRequest(
    log,
    'GET profile HTML to find Messenger thread URL (e2ee/t or t path)',
    profileUrl,
  );
  const fn = log || (() => {});
  fn(
    'facebook profile fetch: chrome.cookies jar length≈',
    cookieProbe.length,
    'cookie names count≈',
    cookieProbe ? cookieProbe.split(';').filter(Boolean).length : 0,
    'has c_user=',
    cookieProbe.includes('c_user='),
    'has xs=',
    cookieProbe.includes('xs='),
    '| wire: credentials=include (browser sends Cookie; no manual Cookie header)',
  );
  const res = await fetch(profileUrl, {
    method: 'GET',
    credentials: 'include',
    redirect: 'follow',
    headers: {
      ...FACEBOOK_CURL_LIKE_GET_HEADERS,
    },
  });
  const html = await res.text();
  /** One log line: full HTML as a single string (DevTools may still truncate display). */
  fn(
    '[PRM facebook-profile FULL HTML] length=' +
      String(html.length) +
      '\n' +
      String(html),
  );
  return { ok: res.ok, status: res.status, html };
}

/**
 * Resolve Messenger thread URL: GET profile HTML, parse thread id from embedded Messenger URLs.
 *
 * @param {string} profileUrl
 * @param {{ log?: (...a: unknown[]) => void, cookieHeader?: string }} [options]
 *   cookieHeader: ignored for HTTP (fetch cannot set Cookie); kept for API compatibility.
 */
export async function resolveMessagingUrlFromProfileHtml(profileUrl, options = {}) {
  const log = options.log || (() => {});

  const normalized = (profileUrl || '').trim();
  if (!normalized) {
    return { error: 'Missing Facebook profile URL.' };
  }

  const cookieProbe = (await getFacebookCookieHeaderForDocumentFetch()).trim();
  if (!cookieProbe) {
    return { error: 'No Facebook cookies in this browser profile. Sign in at facebook.com.' };
  }
  if ((options.cookieHeader || '').trim()) {
    log(
      'resolveMessagingUrlFromProfile: note options.cookieHeader is ignored; using browser cookies (credentials:include)',
    );
  }

  log('resolveMessagingUrlFromProfile: GET', normalized.slice(0, 120));
  const { ok, status, html } = await fetchProfileHtml(normalized, log);
  if (!ok) {
    return { error: `Failed to load profile HTML (${status}).` };
  }

  const embedded = extractMessengerThreadFromProfileHtml(html);
  if (embedded?.messagingUrl) {
    log(
      'resolveMessagingUrlFromProfile: matched Messenger URL in HTML →',
      embedded.threadId,
      'e2ee=',
      embedded.e2ee,
      '→',
      embedded.messagingUrl,
    );
    return {
      messagingUrl: embedded.messagingUrl,
      messengerThreadId: embedded.threadId,
    };
  }

  return {
    error:
      'Could not find Messenger thread in profile HTML (no https://www.facebook.com/messages/e2ee/t/{id-or-username} or /messages/t/{id-or-username} substring).',
  };
}
