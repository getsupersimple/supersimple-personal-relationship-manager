/**
 * Lightweight per-network login checks — no full sync attempt required. Each returns `null`
 * for "couldn't determine" rather than a false negative, so callers can distinguish "definitely
 * logged out" from "unknown" and only act on the former.
 */

/** @returns {Promise<boolean | null>} */
export async function checkLinkedInLogin() {
  try {
    const cookie = await chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'li_at' });
    return Boolean(cookie);
  } catch (_) {
    return null;
  }
}

/** @returns {Promise<boolean | null>} */
export async function checkFacebookLogin() {
  try {
    const cookie = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'c_user' });
    return Boolean(cookie);
  } catch (_) {
    return null;
  }
}

/** @returns {Promise<boolean | null>} */
export async function checkGoogleLogin() {
  const cookieNames = ['SID', '__Secure-1PSID', '__Secure-3PSID'];
  try {
    for (const name of cookieNames) {
      const cookie = await chrome.cookies.get({ url: 'https://www.google.com', name });
      if (cookie) return true;
    }
    return false;
  } catch (_) {
    return null;
  }
}

/**
 * WhatsApp Web has no readable auth cookie — its session lives in the page itself. Only ever
 * peeks at an ALREADY-open web.whatsapp.com tab (never creates one just to check); with none
 * open, status is unknown rather than a false "logged out".
 * @returns {Promise<boolean | null>}
 */
export async function checkWhatsAppLogin() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    if (!tabs.length) return null;
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      world: 'MAIN',
      func: () => Boolean(document.getElementById('pane-side')),
    });
    return Boolean(results?.[0]?.result);
  } catch (_) {
    return null;
  }
}

/**
 * @returns {Promise<{ linkedin: boolean | null, facebook: boolean | null, whatsapp: boolean | null, gmail: boolean | null }>}
 */
export async function checkAllNetworkLoginStatuses() {
  const [linkedin, facebook, whatsapp, gmail] = await Promise.all([
    checkLinkedInLogin(),
    checkFacebookLogin(),
    checkWhatsAppLogin(),
    checkGoogleLogin(),
  ]);
  return { linkedin, facebook, whatsapp, gmail };
}
