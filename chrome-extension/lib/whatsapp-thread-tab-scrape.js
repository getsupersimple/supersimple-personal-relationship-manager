/**
 * Open a 1:1 WhatsApp Web chat in a background tab and read the last N message bubbles.
 * Uses the same inactive-tab pattern as scrapeWhatsAppConversationListViaBackgroundTab.
 */
import { WHATSAPP_CHAT_LIST_ROOT_XPATH } from './whatsapp-tab-scrape.js';
import { sleep, withBackgroundTab } from './tab-scraper-utils.js';

const DEFAULT_LIST_STABILIZE_MS = 2000;
const LIST_ROOT_POLL_MS = 400;
const LIST_ROOT_MAX_WAIT_MS = 28000;
const MAIN_PANEL_MAX_WAIT_MS = 20000;
const SCROLL_TO_BOTTOM_PASSES = 28;
/** Virtualized thread: scroll up to pull older bubbles into the DOM before sampling. */
const SCROLL_UP_HYDRATE_MAX = 28;
const SCROLL_UP_STEP_RATIO = 0.72;
const HYDRATE_SETTLE_MS = 220;

// User-provided stable XPaths for thread open + read.
export const WHATSAPP_CHAT_SEARCH_INPUT_XPATH =
  '/html/body/div[1]/div/div/div/div/div[3]/div/div[4]/div/div[1]/div[1]/div/div/div/div/div/div[2]/input';
export const WHATSAPP_CHAT_SEARCH_FIRST_RESULT_XPATH =
  '/html/body/div[1]/div/div/div/div/div[3]/div/div[4]/div/div[4]/div[1]/div/div/div[2]/div/div';
export const WHATSAPP_THREAD_MESSAGES_CONTAINER_XPATH =
  '/html/body/div[1]/div/div/div/div/div[3]/div/div[5]/div/div[2]/div/div/div[2]/div[3]';


/**
 * @param {string} chatDisplayName - Contacts / WA row display name
 * @param {number} limit - max messages (newest), default 5
 * @param {{ log?: (...a: unknown[]) => void, listStabilizeMs?: number }} [options]
 * @returns {Promise<{ success: true, messages: Array<{ text: string, fromName?: string, deliveredAt?: number|null }>, fetchedFromUrl: string } | { error: string }>}
 */
export async function scrapeWhatsAppThreadRecentMessagesViaBackgroundTab(chatDisplayName, limit = 5, options = {}) {
  const log = options.log || (() => {});
  const listStabilizeMs = options.listStabilizeMs ?? DEFAULT_LIST_STABILIZE_MS;
  const want = String(chatDisplayName || '')
    .trim()
    .replace(/\u202f/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!want) {
    return { error: 'Missing WhatsApp chat name.' };
  }
  const lim = Math.max(1, Math.min(Number(limit) || 5, 25));
  const targetUrl = 'https://web.whatsapp.com/';
  const sourceDebugBase = {
    mechanism: 'whatsapp_thread_tab_scrape',
    listRootXPath: WHATSAPP_CHAT_LIST_ROOT_XPATH,
    searchInputXPath: WHATSAPP_CHAT_SEARCH_INPUT_XPATH,
    searchFirstResultXPath: WHATSAPP_CHAT_SEARCH_FIRST_RESULT_XPATH,
    threadMessagesContainerXPath: WHATSAPP_THREAD_MESSAGES_CONTAINER_XPATH,
    messageSelectors: [
      "div.message-in span.selectable-text",
      "div.message-out span.selectable-text",
      "div.message-in .copyable-text span.selectable-text",
      "div.message-out .copyable-text span.selectable-text",
    ],
  };

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

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (
        listXpath,
        searchInputXpath,
        firstResultXpath,
        threadContainerXpath,
        wantNorm,
        maxMsgs,
        listPollMs,
        listMaxWaitMs,
        mainMaxWaitMs,
        scrollPasses,
        scrollUpMax,
        scrollUpRatio,
        hydrateSettleMs,
      ) => {
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const baseDebug = {
          mechanism: 'whatsapp_thread_tab_scrape',
          listRootXPath: listXpath,
          searchInputXPath: searchInputXpath,
          searchFirstResultXPath: firstResultXpath,
          threadMessagesContainerXPath: threadContainerXpath,
          messageSelectors: [
            "div.message-in span.selectable-text",
            "div.message-out span.selectable-text",
            "div.message-in .copyable-text span.selectable-text",
            "div.message-out .copyable-text span.selectable-text",
          ],
        };

        function xpathFirstElement(context, xpath) {
          try {
            const xr = document.evaluate(xpath, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const n = xr.singleNodeValue;
            if (n && n.nodeType === Node.ELEMENT_NODE) return /** @type {Element} */ (n);
          } catch (_) {}
          return null;
        }

        async function waitForXPathElement(xp, pollMs, maxMs) {
          const deadline = Date.now() + maxMs;
          for (;;) {
            const el = xpathFirstElement(document, xp);
            if (el) return { ok: true, el };
            if (Date.now() >= deadline) return { ok: false, error: 'xpath_timeout' };
            await new Promise((r) => setTimeout(r, pollMs));
          }
        }

        async function waitForListRoot(xp, pollMs, maxMs) {
          const deadline = Date.now() + maxMs;
          for (;;) {
            const el = xpathFirstElement(document, xp);
            if (el) return { ok: true, el };
            if (Date.now() >= deadline) return { ok: false, error: 'list_root_timeout' };
            await new Promise((r) => setTimeout(r, pollMs));
          }
        }

        async function waitUntilVisible(maxMs) {
          const t0 = Date.now();
          if (document.visibilityState === 'visible' && !document.hidden) {
            return { timedOut: false, elapsedMs: 0 };
          }
          let timedOut = false;
          await new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
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
          return { timedOut, elapsedMs: Date.now() - t0 };
        }

        function findScrollable(el) {
          let n = el;
          while (n && n !== document.body && n !== document.documentElement) {
            if (n.scrollHeight > n.clientHeight + 2) return n;
            n = n.parentElement;
          }
          return el;
        }

        // Prefer the explicit search flow: type contact name into the left search box, click first result.
        const searchRes = await waitForXPathElement(searchInputXpath, listPollMs, listMaxWaitMs);
        if (!searchRes.ok) {
          return {
            ok: false,
            error: 'search_input_not_found',
            messages: [],
            sourceDebug: { ...baseDebug, stage: 'search_input', searchInputFound: false },
          };
        }
        const input = searchRes.el;
        try {
          input.focus();
        } catch (_) {}
        try {
          // Clear + type using native value setter to satisfy React-ish handlers.
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, '');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          if (setter) setter.call(input, String(wantNorm || ''));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
          input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
        } catch (_) {}

        const firstRes = await waitForXPathElement(firstResultXpath, listPollMs, listMaxWaitMs);
        if (!firstRes.ok) {
          return {
            ok: false,
            error: 'search_result_not_found',
            messages: [],
            sourceDebug: {
              ...baseDebug,
              stage: 'search_result',
              searchInputFound: true,
              firstResultFound: false,
            },
          };
        }
        const row = firstRes.el;
        try {
          row.scrollIntoView({ block: 'center' });
        } catch (_) {}
        try {
          row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        } catch (_) {}

        /** @type {HTMLElement | null} */
        let main = null;
        const mainDeadline = Date.now() + mainMaxWaitMs;
        while (Date.now() < mainDeadline) {
          const m = document.querySelector('#main');
          if (m instanceof HTMLElement && m.querySelector('[data-id]')) {
            main = m;
            break;
          }
          await new Promise((r) => setTimeout(r, 120));
        }
        if (!main) {
          return {
            ok: false,
            error: 'main_pane_not_found',
            messages: [],
            sourceDebug: {
              ...baseDebug,
              stage: 'main_pane',
              searchInputFound: true,
              firstResultFound: true,
              mainFound: false,
            },
          };
        }

        const containerRes = await waitForXPathElement(threadContainerXpath, listPollMs, mainMaxWaitMs);
        if (!containerRes.ok) {
          return {
            ok: false,
            error: 'thread_container_not_found',
            messages: [],
            sourceDebug: {
              ...baseDebug,
              stage: 'thread_container',
              searchInputFound: true,
              firstResultFound: true,
              mainFound: true,
              threadContainerFound: false,
            },
          };
        }
        const container = containerRes.el;

        const scrollEl = findScrollable(container);

        function collectMessageBubbleDivs(root) {
          const all = Array.from(root.querySelectorAll('div')).filter((div) => {
            if (!(div instanceof HTMLElement)) return false;
            const cn = typeof div.className === 'string' ? div.className : '';
            if (!cn.includes('message-in') && !cn.includes('message-out')) return false;
            const sp =
              div.querySelector(':scope .copyable-text span.selectable-text') ||
              div.querySelector(':scope span.selectable-text');
            return !!sp && !!clean(sp.textContent || '');
          });
          const outer = all.filter((div) => !all.some((o) => o !== div && o.contains(div)));
          outer.sort((a, b) => {
            const rel = a.compareDocumentPosition(b);
            if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
          });
          return outer;
        }

        function bubbleText(div) {
          const copy = div.querySelector(':scope .copyable-text');
          const raw = copy?.innerText || div.querySelector(':scope span.selectable-text')?.textContent || '';
          return clean(raw);
        }

        // Scroll to bottom a few times, then hydrate up until we have enough bubbles.
        for (let p = 0; p < scrollPasses; p++) {
          scrollEl.scrollTop = scrollEl.scrollHeight;
          scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));
          // requestAnimationFrame never fires for a tab that isn't actually composited on
          // screen (a background/inactive tab), no matter what document.hidden reports — use
          // a real timer so this always yields.
          await new Promise((r) => setTimeout(r, 50));
        }

        let bubblesAfterBottom = collectMessageBubbleDivs(container).length;
        let scrollUpIters = 0;
        for (let u = 0; u < scrollUpMax; u++) {
          const n = collectMessageBubbleDivs(container).length;
          if (n >= maxMsgs) break;
          const prevTop = scrollEl.scrollTop;
          const step = Math.max(96, Math.floor(scrollEl.clientHeight * scrollUpRatio));
          scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - step);
          scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));
          await new Promise((r) => setTimeout(r, hydrateSettleMs));
          scrollUpIters = u + 1;
          if (scrollEl.scrollTop === prevTop && u > 2) break;
        }

        for (let p = 0; p < Math.min(10, scrollPasses); p++) {
          scrollEl.scrollTop = scrollEl.scrollHeight;
          scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));
          // requestAnimationFrame never fires for a tab that isn't actually composited on
          // screen (a background/inactive tab), no matter what document.hidden reports — use
          // a real timer so this always yields.
          await new Promise((r) => setTimeout(r, 50));
        }

        const ordered = collectMessageBubbleDivs(container);
        const bubblesAfterHydrate = ordered.length;
        const slice = ordered.slice(-maxMsgs);
        /** @type {Array<{ text: string, fromName?: string, deliveredAt?: null }>} */
        const messages = [];
        for (const el of slice) {
          const text = bubbleText(el);
          if (!text) continue;
          const cls = typeof el.className === 'string' ? el.className : '';
          let fromName;
          if (cls.includes('message-in')) fromName = 'Contact';
          else if (cls.includes('message-out')) fromName = 'Me';
          messages.push({ text, fromName, deliveredAt: null });
        }

        const baseUrl = String(location.origin || 'https://web.whatsapp.com').replace(/\/$/, '') + '/';
        return {
          ok: messages.length > 0,
          error: messages.length ? undefined : 'no_bubbles',
          messages,
          fetchedFromUrl: baseUrl,
          sourceDebug: {
            ...baseDebug,
            stage: messages.length ? 'ok' : 'bubble_collect',
            searchInputFound: true,
            firstResultFound: true,
            mainFound: true,
            threadContainerFound: true,
            waThreadDiag: {
              bubblesAfterBottom,
              bubblesAfterHydrate,
              scrollUpIters,
              sampled: messages.length,
              maxMsgs,
            },
          },
          waThreadDiag: {
            bubblesAfterBottom,
            bubblesAfterHydrate,
            scrollUpIters,
            sampled: messages.length,
            maxMsgs,
          },
        };
      },
      args: [
        WHATSAPP_CHAT_LIST_ROOT_XPATH,
        WHATSAPP_CHAT_SEARCH_INPUT_XPATH,
        WHATSAPP_CHAT_SEARCH_FIRST_RESULT_XPATH,
        WHATSAPP_THREAD_MESSAGES_CONTAINER_XPATH,
        want,
        lim,
        LIST_ROOT_POLL_MS,
        LIST_ROOT_MAX_WAIT_MS,
        MAIN_PANEL_MAX_WAIT_MS,
        SCROLL_TO_BOTTOM_PASSES,
        SCROLL_UP_HYDRATE_MAX,
        SCROLL_UP_STEP_RATIO,
        HYDRATE_SETTLE_MS,
      ],
    });

    const r = results?.[0]?.result;
    if (r?.ok && Array.isArray(r.messages) && r.messages.length > 0) {
      log('whatsappThreadScrape: got messages', r.messages.length, r?.waThreadDiag);
      return {
        success: true,
        messages: r.messages,
        fetchedFromUrl: String(r.fetchedFromUrl || targetUrl),
        ...(r?.sourceDebug ? { sourceDebug: r.sourceDebug } : { sourceDebug: { ...sourceDebugBase, stage: 'unknown_ok' } }),
      };
    }
    return {
      error: r?.error === 'chat_row_not_found'
        ? 'Could not find this chat in WhatsApp Web. Sync WhatsApp contacts and ensure the name matches your chat list.'
        : r?.error === 'main_pane_not_found'
          ? 'WhatsApp conversation pane did not open. Try again with web.whatsapp.com logged in.'
          : r?.error || 'Could not read WhatsApp messages.',
      sourceDebug: r?.sourceDebug || { ...sourceDebugBase, stage: 'inject_failed', injectResult: typeof r },
    };
    }, { log, label: 'WhatsApp thread', restorePreviousTab: true });
  } catch (e) {
    return {
      error: e?.message || String(e) || 'WhatsApp thread scrape failed.',
      sourceDebug: { ...sourceDebugBase, stage: 'exception', err: String(e?.message || e) },
    };
  }
}
