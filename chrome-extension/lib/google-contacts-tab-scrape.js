/**
 * Google Contacts list scrape via a temporary tab (activate for visibility + virtualized list).
 *
 * List root: under `document.body`, the element whose **direct children** include the most
 * `[role="presentation"]` nodes (Contacts row pattern). Name/email: XPath when present,
 * else parsed from row `textContent` / `innerText`.
 */

import { sleep, waitForTabLoadComplete } from './tab-scraper-utils.js';

/** Display name, relative to each row element (optional; falls back to text heuristics). */
export const GOOGLE_CONTACTS_ROW_NAME_REL_XPATH = 'div/div/div[1]/div/div[2]/div[2]/div[1]';

/** Email, relative to each row element. */
export const GOOGLE_CONTACTS_ROW_EMAIL_REL_XPATH =
  'div/div/div[2]/div[3]/div/div/div[1]/span/span/span/div[1]/span';

/**
 * Header label showing how many contacts this view has, e.g. "(0)" or "(42)".
 * When this is "(0)", skip list scrape for this URL.
 */
export const GOOGLE_CONTACTS_HEADER_COUNT_XPATH =
  '/html/body/div[9]/c-wiz[2]/main/div/div[2]/div[3]/div/div[1]/div[1]/div[1]/div/span';
export const GOOGLE_CONTACTS_SCROLL_CONTAINER_XPATH = '/html/body/div[9]/c-wiz[2]/main/div/div[2]';

/** Post-load pause so virtualized UI can mount; keep minimal to reduce pre-scroll delay. */
const DEFAULT_LIST_STABILIZE_MS = 900;
const DEFAULT_RETRY_DELAY_MS = 2800;
const DEFAULT_MAX_ATTEMPTS = 10;
const LIST_ROOT_POLL_MS = 400;
const LIST_ROOT_MAX_WAIT_MS = 45000;
/**
 * Header XPath often misses after DOM churn; fallback supplies the goal. Long polls only delay scrolling.
 */
const HEADER_COUNT_MAX_WAIT_MS = 800;

/** @type {readonly string[]} */
export const GOOGLE_CONTACTS_SYNC_URLS = Object.freeze([
  'https://contacts.google.com/',
  'https://contacts.google.com/directory',
  'https://contacts.google.com/frequent',
  'https://contacts.google.com/other',
]);

/**
 * @param {string} url
 * @param {{ log?: (...a: unknown[]) => void, listStabilizeMs?: number, retryDelayMs?: number, maxAttempts?: number }} [options]
 * @returns {Promise<{ success: true, contacts: Array<{ name: string, email: string }>, googleContactsDiag?: Record<string, unknown> } | { error: string, googleContactsDiag?: Record<string, unknown> }>}
 */
export async function scrapeGoogleContactsPageViaBackgroundTab(url, options = {}) {
  const log = options.log || (() => {});
  const listStabilizeMs = options.listStabilizeMs ?? DEFAULT_LIST_STABILIZE_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const targetUrl = (url || '').trim();
  if (!/^https:\/\/contacts\.google\.com(\/.*)?$/i.test(targetUrl)) {
    return { error: 'Invalid Google Contacts URL.' };
  }

  let tabId = null;
  /** @type {number | null} */
  let previousActiveTabId = null;
  try {
    log('googleContactsTabScrape: creating active tab (load + hydrate while visible)', targetUrl);
    try {
      const prevTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const pid = prevTabs[0]?.id;
      if (pid != null) previousActiveTabId = pid;
    } catch (_) {
      previousActiveTabId = null;
    }
    const tab = await chrome.tabs.create({ url: targetUrl, active: true });
    tabId = tab.id;
    if (tabId == null) return { error: 'Could not create background tab for Google Contacts.' };
    if (previousActiveTabId === tabId) previousActiveTabId = null;

    await waitForTabLoadComplete(tabId, 'Google Contacts tab');
    await sleep(listStabilizeMs);
    log('googleContactsTabScrape: waited', listStabilizeMs, 'ms after load', targetUrl);

    /** @type {Record<string, unknown> | undefined} */
    let lastInjectDiag;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await chrome.tabs.update(tabId, { active: true });
      } catch (e) {
        log('googleContactsTabScrape: activate tab failed', e);
      }
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: async (
          nameRelXPath,
          emailRelXPath,
          headerCountXPath,
          preferredScrollXPath,
          listPollMs,
          listMaxWaitMs,
          headerCountMaxWaitMs,
        ) => {
          const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

          /**
           * Parse "(0)", "(42)", full-width （0）, etc.
           * @param {string} raw
           * @returns {number | null} null if not parseable
           */
          function parseHeaderContactsCount(raw) {
            const t = clean(raw);
            if (!t) return null;
            let m = t.match(/[\(\uFF08]\s*([\d\s,\u202F]{1,13})\s*[\)\uFF09]/);
            if (m) {
              const n = parseInt(m[1].replace(/[\s,\u202F]/g, ''), 10);
              if (Number.isFinite(n)) return n;
            }
            m = t.match(/[\(\uFF08]\s*(\d{1,7})\s*[\)\uFF09]/);
            if (m) return parseInt(m[1], 10);
            return null;
          }

          /**
           * XPath for header often breaks when Google rearranges `c-wiz`. Scan title + main chrome for "(N)" counts.
           * @returns {{ value: number, source: string, snippet: string } | null}
           */
          function findHeaderCountFromDomFallback() {
            const re = /[\(\uFF08]\s*([\d\s,\u202F]{1,13})\s*[\)\uFF09]/g;
            /** @type {Array<{ n: number, snippet: string, source: string }>} */
            const candidates = [];
            const collect = (text, source, maxLen) => {
              const slice = maxLen > 0 ? String(text || '').slice(0, maxLen) : String(text || '');
              let mm;
              const r = new RegExp(re.source, 'g');
              while ((mm = r.exec(slice)) !== null) {
                const n = parseInt(mm[1].replace(/[\s,\u202F]/g, ''), 10);
                if (Number.isFinite(n) && n >= 0 && n < 100000000) {
                  candidates.push({ n, snippet: mm[0].slice(0, 24), source });
                }
              }
            };
            collect(document.title, 'title', 800);
            const banner =
              document.querySelector('main [role="banner"]') ||
              document.querySelector('[role="banner"]') ||
              document.querySelector('header');
            if (banner) collect(banner.innerText || banner.textContent || '', 'banner', 6000);
            const main = document.querySelector('main') || document.querySelector('[role="main"]');
            if (main) collect(main.innerText || main.textContent || '', 'main', 14000);

            if (!candidates.length) return null;
            const tier = (src) => candidates.filter((c) => c.source === src);
            for (const src of ['title', 'banner', 'main']) {
              const arr = tier(src);
              if (!arr.length) continue;
              const best = arr.reduce((a, b) => (a.n >= b.n ? a : b));
              if (best.n > 0) return { value: best.n, source: `fallback_${src}`, snippet: best.snippet };
            }
            // If only "(0)" appears, still return it so empty views can short-circuit quickly.
            for (const src of ['title', 'banner', 'main']) {
              const arr = tier(src);
              if (!arr.length) continue;
              const zero = arr.find((x) => x.n === 0);
              if (zero) return { value: 0, source: `fallback_${src}`, snippet: zero.snippet };
            }
            return null;
          }

          /**
           * @param {Node} context
           * @param {string} relXPath
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

          /**
           * Best parent of `div[role="presentation"]` list rows under `body`.
           * Prefers a parent with ≥2 direct presentation children; else best single row by `scrollHeight`.
           * @returns {{ el: Element, directPresentationChildren: number } | null}
           */
          function findBestPresentationListRoot() {
            const body = document.body;
            if (!body) return null;
            const presNodes = body.querySelectorAll('[role="presentation"]');
            /** @type {Set<Element>} */
            const parents = new Set();
            for (let i = 0; i < presNodes.length; i++) {
              const el = presNodes[i];
              if (el.parentElement) parents.add(el.parentElement);
            }
            /** @type {Element | null} */
            let bestGte2 = null;
            let bestGte2N = 0;
            let bestGte2Scroll = -1;
            /** @type {Element | null} */
            let bestEq1 = null;
            let bestEq1Scroll = -1;
            for (const p of parents) {
              let n = 0;
              for (let j = 0; j < p.children.length; j++) {
                const c = p.children[j];
                if (c instanceof HTMLElement && c.getAttribute('role') === 'presentation') n++;
              }
              const sh = p.scrollHeight | 0;
              if (n >= 2) {
                if (n > bestGte2N || (n === bestGte2N && sh > bestGte2Scroll)) {
                  bestGte2N = n;
                  bestGte2Scroll = sh;
                  bestGte2 = p;
                }
              } else if (n === 1 && sh > bestEq1Scroll) {
                bestEq1Scroll = sh;
                bestEq1 = p;
              }
            }
            const pick = bestGte2 || bestEq1;
            const nPick = bestGte2 ? bestGte2N : 1;
            return pick ? { el: pick, directPresentationChildren: nPick } : null;
          }

          /**
           * @returns {Promise<{ ok: true, el: Element, directPresentationChildren: number } | { ok: false, error: string }>}
           */
          async function waitForPresentationListRoot(pollMs, maxMs) {
            const deadline = Date.now() + maxMs;
            for (;;) {
              const found = findBestPresentationListRoot();
              if (found) return { ok: true, el: found.el, directPresentationChildren: found.directPresentationChildren };
              if (Date.now() >= deadline) return { ok: false, error: 'presentation_list_miss' };
              await new Promise((r) => setTimeout(r, pollMs));
            }
          }

          /** PII-safe hint when no list root matches. */
          function probeListRootMiss() {
            const body = document.body;
            if (!body) return { noBody: true };
            const kids = body.children;
            /** @type {Array<{ slot: number, tag: string, cwizInSubtree: number }>} */
            const bodyChildSlots = [];
            const max = Math.min(kids.length, 16);
            for (let i = 0; i < max; i++) {
              const el = kids[i];
              if (!el || !el.querySelectorAll) continue;
              const cw = el.querySelectorAll('c-wiz').length;
              bodyChildSlots.push({
                slot: i + 1,
                tag: (el.tagName || '').toLowerCase(),
                cwizInSubtree: cw,
              });
            }
            const presAll = body.querySelectorAll('[role="presentation"]').length;
            return { bodyChildCount: kids.length, presentationDivTotal: presAll, bodyChildSlots };
          }

          function extractFirstEmailFromText(t) {
            const s = String(t || '').replace(/\s+/g, ' ').trim();
            const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const m = s.match(re);
            return m && m[0] ? clean(m[0]) : '';
          }

          /**
           * @param {HTMLElement} row
           * @param {string} email
           */
          function displayNameFromRowText(row, email) {
            const raw = String(row.innerText || row.textContent || '').trim();
            const lines = raw
              .split(/\n/)
              .map((x) => clean(x))
              .filter((x) => x.length > 0);
            if (email) {
              const rest = lines.filter((l) => !l.includes(email));
              if (rest.length) return rest[0];
            }
            if (lines.length) return lines[0];
            return email ? email.split('@')[0] : '';
          }

          /**
           * @returns {Promise<{ ok: true, el: Element, raw: string } | { ok: false, error: string }>}
           */
          async function waitForHeaderCountLabel(xp, pollMs, maxMs) {
            // One-shot lookup only: repeated header polling was the dominant pre-scroll delay.
            void pollMs;
            void maxMs;
            try {
              const xr = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
              const n = xr.singleNodeValue;
              if (n && n.nodeType === Node.ELEMENT_NODE) {
                const el = /** @type {Element} */ (n);
                const raw = `${el.textContent || ''}`.trim();
                if (raw) return { ok: true, el, raw };
              }
            } catch (e) {
              return { ok: false, error: String(e?.message || e) };
            }
            return { ok: false, error: 'xpath_miss' };
          }

          function looksLikeEmail(s) {
            const t = clean(s);
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
          }

          /** @param {Element} listRoot */
          function extractRows(listRoot) {
            /** @type {Array<{ name: string, email: string }>} */
            const batch = [];
            const childCount = listRoot.children.length;
            let presentationChildSlots = 0;
            const stepDiag = {
              rowLookup: 'direct [role=presentation] children',
              childCount,
              presentationChildSlots: 0,
              skippedNoRow: 0,
              skippedNoEmail: 0,
              skippedBadEmail: 0,
              skippedEmailName: 0,
              accepted: 0,
            };

            for (let i = 0; i < childCount; i++) {
              const row = listRoot.children[i];
              if (!(row instanceof HTMLElement)) {
                stepDiag.skippedNoRow++;
                continue;
              }
              if (row.getAttribute('role') !== 'presentation') continue;
              presentationChildSlots++;
              const nameEl = xpathFirstElement(row, nameRelXPath);
              const emailEl = xpathFirstElement(row, emailRelXPath);
              let rawName = clean(nameEl?.textContent || nameEl?.getAttribute('title') || '');
              let rawEmail = clean(emailEl?.textContent || emailEl?.getAttribute('title') || '');
              if (!rawEmail) {
                rawEmail = extractFirstEmailFromText(row.innerText || row.textContent || '');
              }
              if (!rawEmail) {
                stepDiag.skippedNoEmail++;
                continue;
              }
              if (!looksLikeEmail(rawEmail)) {
                stepDiag.skippedBadEmail++;
                continue;
              }
              if (!rawName) rawName = displayNameFromRowText(row, rawEmail);
              const name = rawName || rawEmail.split('@')[0] || rawEmail;
              if (looksLikeEmail(name)) {
                stepDiag.skippedEmailName++;
                continue;
              }
              batch.push({ name, email: rawEmail });
              stepDiag.accepted++;
            }
            stepDiag.presentationChildSlots = presentationChildSlots;
            return { batch, rowCount: childCount, stepDiag };
          }

          try {
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
                ...(timedOut
                  ? {
                      snapshotAtTimeout: {
                        vs: document.visibilityState,
                        hidden: document.hidden,
                      },
                    }
                  : {}),
              };
            }

            const visibilityWait = await waitUntilDocumentVisible(12000);
            const prepT0 = Date.now();

            const rootPromise = waitForPresentationListRoot(listPollMs, listMaxWaitMs);
            const headerResult = await waitForHeaderCountLabel(
              headerCountXPath,
              listPollMs,
              headerCountMaxWaitMs,
            );
            const prepAfterHeaderMs = Date.now() - prepT0;
            if (headerResult.ok) {
              const parsed = parseHeaderContactsCount(headerResult.raw);
              if (parsed === 0) {
                return {
                  ok: true,
                  contacts: [],
                  rowCount: 0,
                  error: undefined,
                  googleContactsDiag: {
                    skippedEmptyByHeaderCount: true,
                    headerCountLabel: headerResult.raw,
                    parsedHeaderCount: 0,
                    visibilityWaitMs: visibilityWait.elapsedMs,
                    visibilityTimedOut: visibilityWait.timedOut,
                    prepTimingMs: { headerWaitMs: prepAfterHeaderMs, listRootWaitMs: null, prepTotalMs: prepAfterHeaderMs },
                    ...(visibilityWait.snapshotAtTimeout && {
                      visibilitySnapshotAtTimeout: visibilityWait.snapshotAtTimeout,
                    }),
                  },
                };
              }
            }

            const rootResult = await rootPromise;
            const prepAfterRootMs = Date.now() - prepT0;
            if (!rootResult.ok) {
              return {
                ok: false,
                contacts: [],
                rowCount: 0,
                error: rootResult.error,
                googleContactsDiag: {
                  listRootError: rootResult.error,
                  listRootDiscovery: 'presentation-direct-children',
                  listRootProbe: probeListRootMiss(),
                  headerCountLookup: headerResult.ok ? headerResult.raw : headerResult.error,
                  visibilityWaitMs: visibilityWait.elapsedMs,
                  visibilityTimedOut: visibilityWait.timedOut,
                  prepTimingMs: {
                    headerWaitMs: prepAfterHeaderMs,
                    listRootBlockMs: Math.max(0, Date.now() - prepT0 - prepAfterHeaderMs),
                    prepTotalMs: Date.now() - prepT0,
                  },
                  ...(visibilityWait.snapshotAtTimeout && {
                    visibilitySnapshotAtTimeout: visibilityWait.snapshotAtTimeout,
                  }),
                },
              };
            }
            const listRoot = rootResult.el;
            const presentationDirectChildren = rootResult.directPresentationChildren;
            const all = new Map();
            const merge = (arr) => {
              for (let i = 0; i < arr.length; i++) {
                const c = arr[i];
                const k = (c.email || '').trim().toLowerCase();
                if (k && !all.has(k)) all.set(k, c);
              }
            };

            /**
             * Prefer an ancestor with real overflow + extra content (`scrollHeight > clientHeight`).
             * Uses `overflow-y` so we don't miss `overflow: auto` regions that don't use body scroll.
             * @param {Element} root
             * @returns {HTMLElement}
             */
            function findBestScrollableForList(root) {
              let n = root;
              while (n) {
                if (n instanceof HTMLElement) {
                  const sh = n.scrollHeight;
                  const ch = n.clientHeight;
                  if (sh > ch + 1) {
                    const oy = window.getComputedStyle(n).overflowY;
                    if (
                      oy === 'auto' ||
                      oy === 'scroll' ||
                      oy === 'overlay' ||
                      sh > ch + 8
                    ) {
                      return n;
                    }
                  }
                }
                if (n === document.documentElement) break;
                n = n.parentElement;
              }
              const se = document.scrollingElement;
              if (se instanceof HTMLElement) return se;
              return document.documentElement;
            }

            /**
             * @param {string} xp
             * @returns {HTMLElement | null}
             */
            function getElementByXPath(xp) {
              if (!xp) return null;
              try {
                const xr = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                const n = xr.singleNodeValue;
                return n instanceof HTMLElement ? n : null;
              } catch (_) {
                return null;
              }
            }

            function countPresentationRows(listRoot) {
              let c = 0;
              for (let i = 0; i < listRoot.children.length; i++) {
                const ch = listRoot.children[i];
                if (ch instanceof HTMLElement && ch.getAttribute('role') === 'presentation') c++;
              }
              return c;
            }

            /**
             * Virtualized lists need small scroll steps so rows mount/unmount gradually.
             * @param {Element} listRoot
             * @returns {number} clamped px (~one row)
             */
            function estimatePresentationRowStepPx(listRoot) {
              let sum = 0;
              let n = 0;
              for (let i = 0; i < listRoot.children.length; i++) {
                const ch = listRoot.children[i];
                if (!(ch instanceof HTMLElement) || ch.getAttribute('role') !== 'presentation') continue;
                const h = ch.getBoundingClientRect().height;
                if (h > 10 && h < 500) {
                  sum += h;
                  n++;
                }
              }
              if (n === 0) return 56;
              const avg = sum / n;
              return Math.max(40, Math.min(130, Math.round(avg)));
            }

            /** @param {HTMLElement} el */
            function probeScrollEl(el) {
              try {
                const cs = window.getComputedStyle(el);
                return {
                  tag: el.tagName,
                  id: el.id || '',
                  cls: (typeof el.className === 'string' ? el.className : '').slice(0, 80),
                  sh: el.scrollHeight,
                  ch: el.clientHeight,
                  oy: cs.overflowY,
                };
              } catch (e) {
                return { error: String(e?.message || e) };
              }
            }

            /**
             * Scroll a little at a time so virtualized rows stay in sync with the DOM.
             * Split each pass into sub-steps on rAF (no artificial timeouts). Avoid `scrollIntoView(end)` — it jumps too far.
             * @param {HTMLElement} scrollEl
             * @param {Element} listRoot
             * @param {number} stepPx total px for this pass (already capped small)
             * @returns {Promise<{ beforeTop: number, afterTop: number, beforeWin: number, afterWin: number, maxScrollTop: number }>}
             */
            async function nudgeScrollForward(scrollEl, listRoot, stepPx) {
              const beforeWin = window.scrollY || window.pageYOffset || 0;
              const beforeTop = scrollEl.scrollTop;

              const subSteps = 4;
              const base = Math.max(6, Math.floor(stepPx / subSteps));
              let curMax = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);

              for (let s = 0; s < subSteps; s++) {
                const prevTop = scrollEl.scrollTop;
                const slice =
                  s === subSteps - 1
                    ? Math.max(0, stepPx - base * (subSteps - 1))
                    : base;
                if (slice <= 0) continue;

                curMax = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
                if (curMax > 0) {
                  const nextTop = Math.min(prevTop + slice, curMax);
                  try {
                    scrollEl.scrollTo({ top: nextTop, behavior: 'instant' });
                  } catch (_) {
                    scrollEl.scrollTop = nextTop;
                  }
                  curMax = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
                }

                const winSlice = Math.min(slice + 2, Math.max(slice, Math.round(slice * 1.05)));
                try {
                  window.scrollBy({ top: winSlice, left: 0, behavior: 'instant' });
                } catch (_) {
                  window.scrollBy(0, winSlice);
                }

                try {
                  const ev = new WheelEvent('wheel', {
                    deltaY: slice,
                    deltaMode: 0,
                    bubbles: true,
                    cancelable: true,
                    view: window,
                  });
                  listRoot.dispatchEvent(ev);
                  scrollEl.dispatchEvent(ev);
                } catch (_) {}

                if (s < subSteps - 1) {
                  await new Promise((r) => requestAnimationFrame(r));
                }
              }

              const afterTop = scrollEl.scrollTop;
              const afterWin = window.scrollY || window.pageYOffset || 0;
              curMax = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
              return { beforeTop, afterTop, beforeWin, afterWin, maxScrollTop: curMax };
            }

            /** Header total when parseable — keep scrolling while we're short of this count. */
            let headerGoalSource = 'none';
            /** @type {string | null} */
            let headerFallbackSnippet = null;
            let parsedHeaderGoal = headerResult.ok ? parseHeaderContactsCount(headerResult.raw) : null;
            if (typeof parsedHeaderGoal === 'number' && parsedHeaderGoal > 0) {
              headerGoalSource = 'xpath';
            } else {
              const fb = findHeaderCountFromDomFallback();
              if (fb && fb.value > 0) {
                parsedHeaderGoal = fb.value;
                headerGoalSource = fb.source;
                headerFallbackSnippet = fb.snippet;
              }
            }
            const headerContactGoal =
              typeof parsedHeaderGoal === 'number' && parsedHeaderGoal > 0 ? parsedHeaderGoal : null;

            /** @type {HTMLElement} */
            const preferredScrollEl = getElementByXPath(preferredScrollXPath);
            const preferredScrollContainsList =
              !!(preferredScrollEl && (preferredScrollEl === listRoot || preferredScrollEl.contains(listRoot)));
            let scrollEl =
              preferredScrollEl && preferredScrollContainsList
                ? preferredScrollEl
                : findBestScrollableForList(listRoot);
            /** Small steps per pass → need more passes for long lists. */
            const MAX_SCROLL_PASSES = 900;
            let totalRowPeek = 0;
            /** @type {Record<string, unknown> | null} */
            let lastStepDiag = null;
            let lastSeenCount = -1;
            let stagnant = 0;
            const STAGNANT_LIMIT = headerContactGoal != null ? 10 : 28;
            const SCROLL_STUCK_LIMIT = headerContactGoal != null ? 8 : 36;
            let scrollStuck = 0;
            let scrollExitReason = 'max_passes';
            let lastScrollPassIndex = -1;
            /** @type {{ dTop: number, dWin: number, maxScrollTop: number } | null} */
            let lastNudgeDiag = null;
            /** @type {Record<string, unknown> | null} */
            let scrollElProbeFirst = null;
            /** @type {Array<Record<string, unknown>>} */
            const nudgeSamples = [];
            const MAX_NUDGE_SAMPLES = 14;

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

              scrollEl =
                preferredScrollEl && preferredScrollContainsList
                  ? preferredScrollEl
                  : findBestScrollableForList(listRoot);
              if (scrollElProbeFirst == null) scrollElProbeFirst = probeScrollEl(scrollEl);
              const shortOfHeader =
                headerContactGoal != null && all.size < headerContactGoal;

              const rowStepPx = estimatePresentationRowStepPx(listRoot);
              const vh = scrollEl.clientHeight || window.innerHeight || 480;
              const stepPx = Math.max(
                32,
                Math.min(Math.round(rowStepPx * 1.35), Math.floor(vh * 0.16), 140),
              );
              const nudge = await nudgeScrollForward(scrollEl, listRoot, stepPx);
              lastNudgeDiag = {
                dTop: nudge.afterTop - nudge.beforeTop,
                dWin: nudge.afterWin - nudge.beforeWin,
                maxScrollTop: nudge.maxScrollTop,
              };

              if (nudgeSamples.length < MAX_NUDGE_SAMPLES) {
                const wantEarly = pass < 5;
                const wantSparse = pass === 10 || pass === 20 || pass === 40 || pass === 80;
                const wantGoal =
                  shortOfHeader && (pass % 5 === 0 || pass < 8);
                if (wantEarly || wantSparse || wantGoal) {
                  nudgeSamples.push({
                    pass,
                    merged: all.size,
                    rowPeek: rowCount,
                    stagnant,
                    scrollStuck,
                    shortOfHeader,
                    presRows: countPresentationRows(listRoot),
                    ...lastNudgeDiag,
                  });
                }
              }

              scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));
              void scrollEl.offsetHeight;
              for (let ci = 0; ci < listRoot.children.length; ci++) {
                const cel = listRoot.children[ci];
                if (cel instanceof HTMLElement) void cel.getBoundingClientRect();
              }

              const moved =
                nudge.afterTop > nudge.beforeTop + 1 ||
                nudge.afterWin > nudge.beforeWin + 1;
              if (!moved && !shortOfHeader) {
                scrollStuck++;
              } else {
                scrollStuck = 0;
              }

              const atBottom =
                nudge.maxScrollTop > 0 && nudge.afterTop >= nudge.maxScrollTop - 2;

              if (atBottom && stagnant >= STAGNANT_LIMIT && !shortOfHeader) {
                scrollExitReason = 'bottom_stagnant';
                break;
              }
              if (scrollStuck >= SCROLL_STUCK_LIMIT && !shortOfHeader) {
                scrollExitReason = 'scroll_top_stuck';
                break;
              }

              if (!document.hidden) {
                await new Promise((r) => requestAnimationFrame(r));
                await new Promise((r) => requestAnimationFrame(r));
              }
            }

            const contacts = Array.from(all.values());
            if (lastNudgeDiag && nudgeSamples.length < MAX_NUDGE_SAMPLES) {
              nudgeSamples.push({
                pass: lastScrollPassIndex,
                merged: contacts.length,
                stagnant,
                scrollStuck,
                shortOfHeader: headerContactGoal != null && contacts.length < headerContactGoal,
                presRows: countPresentationRows(listRoot),
                finalSample: true,
                ...lastNudgeDiag,
              });
            }
            const googleContactsDiag = {
              ...(lastStepDiag || {}),
              listRootDiscovery: 'presentation-direct-children',
              presentationDirectChildren,
              headerContactGoal,
              headerGoalSource,
              ...(headerFallbackSnippet ? { headerFallbackSnippet } : {}),
              preferredScrollXPathUsed: preferredScrollEl && preferredScrollContainsList ? preferredScrollXPath : null,
              preferredScrollFound: !!preferredScrollEl,
              preferredScrollContainsList,
              prepTimingMs: {
                headerWaitMs: prepAfterHeaderMs,
                listRootBlockMs: Math.max(0, prepAfterRootMs - prepAfterHeaderMs),
                prepTotalMs: prepAfterRootMs,
              },
              mergedContactCount: contacts.length,
              totalRowPeek,
              scrollSteps: lastScrollPassIndex + 1,
              scrollExitReason,
              lastScrollNudge: lastNudgeDiag,
              scrollElProbeFirst,
              scrollElProbeLast: probeScrollEl(scrollEl),
              nudgeSamples,
              visibilityWaitMs: visibilityWait.elapsedMs,
              visibilityTimedOut: visibilityWait.timedOut,
              ...(visibilityWait.snapshotAtTimeout && {
                visibilitySnapshotAtTimeout: visibilityWait.snapshotAtTimeout,
              }),
              ...(headerResult.ok
                ? {
                    headerCountLabel: headerResult.raw,
                    parsedHeaderCount: parseHeaderContactsCount(headerResult.raw),
                  }
                : { headerCountLookup: headerResult.error }),
            };

            return {
              ok: true,
              contacts,
              rowCount: totalRowPeek,
              error: contacts.length ? undefined : 'empty',
              googleContactsDiag,
            };
          } catch (e) {
            return {
              ok: false,
              contacts: [],
              rowCount: 0,
              error: String(e?.message || e),
              googleContactsDiag: { error: String(e?.message || e) },
            };
          }
        },
        args: [
          GOOGLE_CONTACTS_ROW_NAME_REL_XPATH,
          GOOGLE_CONTACTS_ROW_EMAIL_REL_XPATH,
          GOOGLE_CONTACTS_HEADER_COUNT_XPATH,
          GOOGLE_CONTACTS_SCROLL_CONTAINER_XPATH,
          LIST_ROOT_POLL_MS,
          LIST_ROOT_MAX_WAIT_MS,
          HEADER_COUNT_MAX_WAIT_MS,
        ],
      });
      const r = results?.[0]?.result;
      if (r?.googleContactsDiag && typeof r.googleContactsDiag === 'object') {
        lastInjectDiag = /** @type {Record<string, unknown>} */ (r.googleContactsDiag);
      }
      if (r?.ok && Array.isArray(r.contacts)) {
        log('googleContactsTabScrape: page done', {
          attempt,
          url: targetUrl,
          rows: r.rowCount,
          contacts: r.contacts.length,
          googleContactsDiag: r.googleContactsDiag,
        });
        return {
          success: true,
          contacts: r.contacts,
          googleContactsDiag: r.googleContactsDiag,
        };
      }
      log(
        'googleContactsTabScrape: attempt',
        attempt,
        '/',
        maxAttempts,
        targetUrl,
        r?.error || '',
        r?.googleContactsDiag,
      );
      if (attempt < maxAttempts) await sleep(retryDelayMs);
    }
    return {
      error: 'Google Contacts list not found or empty for this page.',
      googleContactsDiag: lastInjectDiag,
    };
  } catch (e) {
    return { error: e?.message || String(e) || 'Google Contacts scrape failed.' };
  } finally {
    if (previousActiveTabId != null) {
      try {
        await chrome.tabs.update(previousActiveTabId, { active: true });
      } catch (_) {}
    }
    if (tabId != null) {
      try {
        await chrome.tabs.remove(tabId);
        log('googleContactsTabScrape: closed tab', tabId);
      } catch (_) {}
    }
  }
}
