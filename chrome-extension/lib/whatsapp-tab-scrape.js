/**
 * WhatsApp Web conversation-list scrape via inactive background tab.
 *
 * **listRoot** — `#pane-side` (chat list pane), looked up by id via XPath.
 * **Per-row** — iterate `listRoot.children[i]` for `i = 0` (first list child) upward. XPath `div[1]` under
 * listRoot is only the first *div* child; if the first child is not a `div`, that skipped the real first row.
 *
 * Paths below are **relative to each row element** (the child of listRoot):
 *
 * **1:1 display name** — `div/div/div[4]/div/div/div/div/div/div/div/div/span`
 * **Latest message** — `div/div/div/div[2]/div[2]/div[1]/span/span`
 * **Group (skip)** — if the 1:1 display name span above is not found, the row is treated as a group
 * conversation (or otherwise not a person) and skipped.
 *
 * **Scrape** — scroll the virtualized chat list while the tab is briefly **activated**, wait for
 * `document.visibilityState === 'visible'`, then restore the previously active tab.
 */

/** Chat list pane root — `#pane-side`, a stable id WhatsApp Web assigns regardless of surrounding markup. */
export const WHATSAPP_CHAT_LIST_ROOT_XPATH = '//*[@id="pane-side"]';

import { sleep, withBackgroundTab } from './tab-scraper-utils.js';

/** After `load complete`, wait this long (inactive tab) before scrape / HTML dump so layout can settle. */
const DEFAULT_LIST_STABILIZE_MS = 2000;
const DEFAULT_RETRY_DELAY_MS = 2500;
const DEFAULT_MAX_ATTEMPTS = 8;
/** In inactive tabs layout is often throttled; poll for list root instead of failing fast. */
const LIST_ROOT_POLL_MS = 400;
const LIST_ROOT_MAX_WAIT_MS = 28000;

/**
 * @param {string} url
 * @param {{ log?: (...a: unknown[]) => void, listStabilizeMs?: number, firstWaitMs?: number, retryDelayMs?: number, maxAttempts?: number }} [options]
 * `firstWaitMs` — deprecated alias for `listStabilizeMs`.
 * @returns {Promise<{ success: true, chats: Array<{ name: string, chatKey: string, previewText?: string, phoneE164?: string }>, waScrapeDiag?: Record<string, unknown> } | { error: string, waScrapeDiag?: Record<string, unknown> }>}
 */
export async function scrapeWhatsAppConversationListViaBackgroundTab(url, options = {}) {
  const log = options.log || (() => {});
  const listStabilizeMs =
    options.listStabilizeMs ?? options.firstWaitMs ?? DEFAULT_LIST_STABILIZE_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const targetUrl = (url || '').trim();
  if (!/^https:\/\/web\.whatsapp\.com\/?/i.test(targetUrl)) {
    return { error: 'Invalid WhatsApp Web URL.' };
  }

  try {
    return await withBackgroundTab(targetUrl, async (tabId) => {
    // Override visibility APIs so WhatsApp Web renders in the background tab.
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
          Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
          document.dispatchEvent(new Event('visibilitychange'));
        } catch (_) {}
      },
    });
    await sleep(listStabilizeMs);
    log('whatsappTabScrape: background tab — waited', listStabilizeMs, 'ms after load');

    /** @type {Record<string, unknown> | undefined} */
    let lastInjectDiag;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async (xpath, listPollMs, listMaxWaitMs) => {
          const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
          const looksLikeGroup = (text) => {
            const t = (text || '').toLowerCase();
            return (
              t.includes('chat.whatsapp.com/') ||
              t.includes('community') ||
              t.includes('members') ||
              t.includes('participants')
            );
          };
          const normalizeName = (name) =>
            clean(name)
              .replace(/^~\s*/u, '')
              .replace(/\u202f/g, ' ');
          const phoneLike = (name) => {
            const digits = (name || '').replace(/[^\d+]/g, '');
            return /^\+?\d{7,16}$/.test(digits) ? digits : '';
          };

          /** WhatsApp list often appends "M/D/YYYY " before the preview in flattened text. */
          const stripListRowDateTail = (s) => {
            const t = (s || '').trim();
            const cut = t.search(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+/);
            if (cut > 0) return t.slice(0, cut).trim();
            return t;
          };

          /** Strip transient "Loading…" / "Loading..." from title or preview while WA hydrates. */
          const stripWhatsAppLoadingLabel = (s) =>
            clean(String(s || ''))
              .replace(/\bLoading\.{2,3}\b/gi, '')
              .replace(/Loading…/gu, '')
              .replace(/Loading\u2026/gu, '')
              .replace(/\s+/g, ' ')
              .trim();

          /** Bidi / embedding marks WA wraps around labels (e.g. blocked status). */
          const stripEmbeddingMarkers = (s) =>
            String(s || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '');

          const BLOCKED_CONVERSATION_RE = /you\s+blocked\s+this\s+person/i;

          /**
           * Row shows “You blocked this person” (including hidden embedding markers).
           * @param {HTMLElement} row
           */
          function rowIndicatesBlockedConversation(row) {
            const raw = `${row.innerText || ''}\n${row.textContent || ''}`;
            return BLOCKED_CONVERSATION_RE.test(stripEmbeddingMarkers(raw));
          }

          /**
           * @param {Node} context
           * @param {string} relXPath - Relative to context (e.g. div[1]/div/...).
           * @returns {Element | null}
           */
          function xpathFirstElement(context, relXPath) {
            try {
              const xr = document.evaluate(
                relXPath,
                context,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
              );
              const n = xr.singleNodeValue;
              if (n && n.nodeType === Node.ELEMENT_NODE) return /** @type {Element} */ (n);
            } catch (_) {}
            return null;
          }

          /** 1:1 name span, relative to list row root. Absent => group conversation, skip. */
          const XPATH_ROW_ONE_TO_ONE_NAME_SPAN = 'div/div/div[4]/div/div/div/div/div/div/div/div/span';
          /** Latest message preview, relative to list row root. */
          const XPATH_ROW_PREVIEW_SPAN = 'div/div/div/div[2]/div[2]/div[1]/span/span';

          /**
           * Skip contacts whose displayed name is only a phone-style string (digits + tel punctuation).
           * @param {string} displayName
           */
          function isPhoneNumberOnlyDisplayName(displayName) {
            const t = stripEmbeddingMarkers(String(displayName || '').trim());
            if (!t) return false;
            const digits = t.replace(/\D/g, '');
            if (digits.length < 7 || digits.length > 17) return false;
            if (!/^[\s\d+()\-–—.,/[\]·•\u00a0\u202f]+$/u.test(t)) return false;
            return true;
          }

          /**
           * @returns {Promise<{ ok: true, el: Element } | { ok: false, error: string }>}
           */
          async function waitForListRoot(xp, pollMs, maxMs) {
            const deadline = Date.now() + maxMs;
            for (;;) {
              try {
                const xr = document.evaluate(
                  xp,
                  document,
                  null,
                  XPathResult.FIRST_ORDERED_NODE_TYPE,
                  null,
                );
                const n = xr.singleNodeValue;
                if (n && n.nodeType === Node.ELEMENT_NODE) {
                  return { ok: true, el: /** @type {Element} */ (n) };
                }
              } catch (e) {
                return { ok: false, error: String(e?.message || e) };
              }
              if (Date.now() >= deadline) return { ok: false, error: 'xpath_miss' };
              await new Promise((r) => setTimeout(r, pollMs));
            }
          }

          /** @param {Element} listRoot */
          function extractRows(listRoot) {
            /** @type {Array<{ name: string, chatKey: string, previewText?: string, phoneE164?: string }>} */
            const batch = [];
            const childCount = listRoot.children.length;
            const stepDiag = {
              rowLookup: 'listRoot.children[i] i=0..n-1 + row-relative XPath',
              roleRowCount: childCount,
              rowsResolved: childCount,
              skippedIcon: 0,
              skippedBlocked: 0,
              skippedGroupNoNameSpan: 0,
              skippedPhoneOnlyDisplay: 0,
              skippedEmptyName: 0,
              skippedLooksLikeGroup: 0,
              skippedNoRowRoot: 0,
              accepted: 0,
            };

            for (let i = 0; i < childCount; i++) {
              const row = listRoot.children[i];
              if (!(row instanceof HTMLElement)) {
                stepDiag.skippedNoRowRoot++;
                continue;
              }
              if (row.querySelector('[data-icon*="community"], [data-icon*="newsletter"], [data-icon*="group"]')) {
                stepDiag.skippedIcon++;
                continue;
              }
              if (rowIndicatesBlockedConversation(row)) {
                stepDiag.skippedBlocked++;
                continue;
              }
              const nameSpan = xpathFirstElement(row, XPATH_ROW_ONE_TO_ONE_NAME_SPAN);
              if (!nameSpan) {
                // No 1:1 display-name span => group conversation (or otherwise not a person); skip.
                stepDiag.skippedGroupNoNameSpan++;
                continue;
              }

              const rawName = clean(
                nameSpan.textContent || nameSpan.getAttribute('title') || '',
              );
              const previewEl = xpathFirstElement(row, XPATH_ROW_PREVIEW_SPAN);
              const previewText = previewEl ? clean(previewEl.textContent || '') : '';

              let rawNameNorm = stripWhatsAppLoadingLabel(rawName);
              rawNameNorm = stripListRowDateTail(rawNameNorm);
              const previewRaw = stripWhatsAppLoadingLabel(previewText || '');
              const name = normalizeName(rawNameNorm);
              const rowText = clean(row.innerText || '');
              if (!name) {
                stepDiag.skippedEmptyName++;
                continue;
              }
              if (looksLikeGroup(name) || looksLikeGroup(rowText)) {
                stepDiag.skippedLooksLikeGroup++;
                continue;
              }
              if (isPhoneNumberOnlyDisplayName(name)) {
                stepDiag.skippedPhoneOnlyDisplay++;
                continue;
              }

              const preview = previewRaw || undefined;
              const key = `name:${name.toLowerCase()}`;
              const phone = phoneLike(name);
              batch.push({
                name,
                chatKey: key,
                previewText: preview,
                phoneE164: phone || undefined,
              });
              stepDiag.accepted++;
            }
            return { batch, rowCount: childCount, stepDiag };
          }

          try {
            /** Wait for Page Visibility after extension activates tab (virtual list stays frozen while hidden). */
            async function waitUntilDocumentVisible(maxMs) {
              const t0 = Date.now();
              const visibilityStateStart = document.visibilityState;
              const hiddenStart = !!document.hidden;
              if (document.visibilityState === 'visible' && !document.hidden) {
                return {
                  visibilityStateStart,
                  hiddenStart,
                  visibilityStateEnd: document.visibilityState,
                  hiddenEnd: !!document.hidden,
                  timedOut: false,
                  elapsedMs: 0,
                };
              }
              let timedOut = false;
              await new Promise((resolve) => {
                let settled = false;
                const finish = () => {
                  if (settled) return;
                  settled = true;
                  document.removeEventListener('visibilitychange', onVis);
                  try {
                    clearTimeout(safety);
                  } catch (_) {}
                  resolve(undefined);
                };
                const onVis = () => {
                  if (document.visibilityState === 'visible') finish();
                };
                document.addEventListener('visibilitychange', onVis);
                const safety = setTimeout(() => {
                  timedOut = true;
                  finish();
                }, maxMs);
              });
              return {
                visibilityStateStart,
                hiddenStart,
                visibilityStateEnd: document.visibilityState,
                hiddenEnd: !!document.hidden,
                timedOut,
                elapsedMs: Date.now() - t0,
              };
            }

            const rootResult = await waitForListRoot(xpath, listPollMs, listMaxWaitMs);
            if (!rootResult.ok) {
              return {
                ok: false,
                chats: [],
                rowCount: 0,
                error: rootResult.error,
                waScrapeDiag: { listRootError: rootResult.error },
              };
            }
            const listRoot = rootResult.el;
            const waVisibilityWait = await waitUntilDocumentVisible(12000);
            const all = new Map();
            const merge = (arr) => {
              for (let i = 0; i < arr.length; i++) {
                const c = arr[i];
                if (c.chatKey && !all.has(c.chatKey)) all.set(c.chatKey, c);
              }
            };

            /** @param {Element} el */
            function findScrollable(el) {
              let n = el;
              while (n && n !== document.body && n !== document.documentElement) {
                if (n.scrollHeight > n.clientHeight + 2) return n;
                n = n.parentElement;
              }
              return el;
            }

            const scrollEl = findScrollable(listRoot);
            const MAX_SCROLL_PASSES = 120;
            let totalRowPeek = 0;
            /** @type {Record<string, unknown> | null} */
            let lastStepDiag = null;
            let lastSeenCount = -1;
            let stagnant = 0;
            const STAGNANT_LIMIT = 6;
            /** Stop if assigned scrollTop never moves (avoid 120 useless passes). */
            const SCROLL_STUCK_LIMIT = 4;
            let scrollStuck = 0;
            let scrollExitReason = 'max_passes';
            let lastScrollPassIndex = -1;

            for (let pass = 0; pass < MAX_SCROLL_PASSES; pass++) {
              lastScrollPassIndex = pass;
              const { batch, rowCount, stepDiag } = extractRows(listRoot);
              lastStepDiag = stepDiag;
              merge(batch);
              totalRowPeek = Math.max(totalRowPeek, rowCount);
              const seenCount = all.size;
              if (seenCount === lastSeenCount) stagnant++;
              else {
                stagnant = 0;
                lastSeenCount = seenCount;
              }

              const maxScrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
              const beforeTop = scrollEl.scrollTop;
              if (maxScrollTop <= 0) {
                scrollExitReason = 'not_scrollable';
                break;
              }
              if (beforeTop >= maxScrollTop - 2 && stagnant >= STAGNANT_LIMIT) {
                scrollExitReason = 'bottom_stagnant';
                break;
              }
              if (scrollStuck >= SCROLL_STUCK_LIMIT) {
                scrollExitReason = 'scroll_top_stuck';
                break;
              }

              const stepPx = Math.max(64, Math.floor(scrollEl.clientHeight * 0.7));
              const nextTop = Math.min(beforeTop + stepPx, maxScrollTop);
              try {
                scrollEl.scrollTo({ top: nextTop, behavior: 'instant' });
              } catch (_) {
                scrollEl.scrollTop = nextTop;
              }
              scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));
              void scrollEl.offsetHeight;
              for (let ci = 0; ci < listRoot.children.length; ci++) {
                const cel = listRoot.children[ci];
                if (cel instanceof HTMLElement) void cel.getBoundingClientRect();
              }
              const afterTop = scrollEl.scrollTop;
              if (nextTop > beforeTop + 8 && afterTop <= beforeTop + 2) {
                scrollStuck++;
              } else {
                scrollStuck = 0;
              }
              // requestAnimationFrame never fires for a tab that isn't actually composited on
              // screen (a background/inactive tab), no matter what document.hidden reports — use
              // a real timer so this always yields and lets React mount newly scrolled-in rows.
              await new Promise((r) => setTimeout(r, 50));
            }

            const chats = Array.from(all.values());
            const waScrapeDiag = {
              ...(lastStepDiag || {}),
              mergedChatCount: chats.length,
              totalRowPeek,
              scrollSteps: lastScrollPassIndex + 1,
              scrollExitReason,
              waVisibilityWaitMs: waVisibilityWait.elapsedMs,
              waVisibilityTimedOut: waVisibilityWait.timedOut,
            };

            return {
              ok: chats.length > 0,
              chats,
              rowCount: totalRowPeek,
              error: chats.length ? undefined : 'empty',
              waScrapeDiag,
            };
          } catch (e) {
            return {
              ok: false,
              chats: [],
              rowCount: 0,
              error: String(e?.message || e),
              waScrapeDiag: { error: String(e?.message || e) },
            };
          }
        },
        args: [WHATSAPP_CHAT_LIST_ROOT_XPATH, LIST_ROOT_POLL_MS, LIST_ROOT_MAX_WAIT_MS],
      });
      const r = results?.[0]?.result;
      if (r?.waScrapeDiag && typeof r.waScrapeDiag === 'object') {
        lastInjectDiag = /** @type {Record<string, unknown>} */ (r.waScrapeDiag);
      }
      if (r?.ok && Array.isArray(r.chats) && r.chats.length > 0) {
        log('whatsappTabScrape: extracted chats', {
          attempt,
          rows: r.rowCount,
          chats: r.chats.length,
          waScrapeDiag: r.waScrapeDiag,
        });
        return {
          success: true,
          chats: r.chats,
          waScrapeDiag: r.waScrapeDiag,
        };
      }
      log('whatsappTabScrape: attempt', attempt, '/', maxAttempts, 'no chats yet', r?.error || '', {
        waScrapeDiag: r?.waScrapeDiag,
      });
      if (attempt < maxAttempts) await sleep(retryDelayMs);
    }
    return {
      error: 'WhatsApp conversation list not found or empty.',
      waScrapeDiag: lastInjectDiag,
    };
    }, { log, label: 'WhatsApp', restorePreviousTab: true });
  } catch (e) {
    return { error: e?.message || String(e) || 'WhatsApp scrape failed.' };
  }
}
