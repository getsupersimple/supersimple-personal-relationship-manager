/**
 * Gmail latest-message scrape via temporary tab.
 *
 * Opens Gmail search for one contact email:
 *   https://mail.google.com/mail/u/0/#search/<url-encoded-email>
 *
 * Reads the first row snippet from the search-result table body.
 */

import { sleep, withBackgroundTab } from './tab-scraper-utils.js';

const DEFAULT_LIST_STABILIZE_MS = 1800;
const DEFAULT_LIST_POLL_MS = 450;
const DEFAULT_LIST_MAX_WAIT_MS = 30000;

export const GMAIL_SEARCH_RESULTS_TBODY_XPATH =
  '/html/body/div[6]/div[3]/div/div[2]/div[4]/div/div/div/div[2]/div/div[1]/div/div[3]/div/div[2]/div[1]/div[2]/div[6]/div[1]/div[1]/div[3]/div/table/tbody';

/**
 * @param {string} email
 * @param {{ log?: (...a: unknown[]) => void, listStabilizeMs?: number, listPollMs?: number, listMaxWaitMs?: number }} [options]
 * @returns {Promise<{ success: true, email: string, lastMessageText: string, recentSnippets: string[], searchUrl: string, rowCount: number } | { error: string }>}
 */
export async function scrapeGmailLatestMessageByEmailViaBackgroundTab(email, options = {}) {
  const log = options.log || (() => {});
  const listStabilizeMs = options.listStabilizeMs ?? DEFAULT_LIST_STABILIZE_MS;
  const listPollMs = options.listPollMs ?? DEFAULT_LIST_POLL_MS;
  const listMaxWaitMs = options.listMaxWaitMs ?? DEFAULT_LIST_MAX_WAIT_MS;
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { error: 'Invalid email for Gmail latest-message fetch.' };
  }

  const targetUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(normalizedEmail)}`;

  try {
    return await withBackgroundTab(targetUrl, async (tabId) => {
    await sleep(listStabilizeMs);
    try {
      await chrome.tabs.update(tabId, { active: true });
    } catch (_) {}

    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (tbodyXPath, pollMs, maxWaitMs) => {
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const xpathFirst = (context, xpath) => {
          try {
            const xr = document.evaluate(xpath, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            return xr.singleNodeValue instanceof Element ? xr.singleNodeValue : null;
          } catch (_) {
            return null;
          }
        };

        function countDirectTr(tb) {
          let n = 0;
          const kids = tb.children;
          for (let i = 0; i < kids.length; i++) {
            if (kids[i].tagName === 'TR') n++;
          }
          return n;
        }

        /** Prefer the list tbody (many direct `tr` rows) when absolute XPath drifts. */
        function findLargestTbodyByDirectTr() {
          const tbodies = document.querySelectorAll('tbody');
          /** @type {HTMLTableSectionElement | null} */
          let best = null;
          let bestN = 0;
          for (let i = 0; i < tbodies.length; i++) {
            const tb = tbodies[i];
            const n = countDirectTr(tb);
            if (n > bestN) {
              bestN = n;
              best = tb;
            }
          }
          return { el: best, directTrCount: bestN };
        }

        function rowSnippet(row) {
          const byXPath = xpathFirst(row, 'td[6]/div/div/span');
          if (byXPath) return clean(byXPath.textContent || '');
          const td6 = row.querySelector('td:nth-child(6)');
          if (td6) {
            const sp = td6.querySelector('span');
            if (sp) return clean(sp.textContent || '');
            return clean(td6.textContent || '');
          }
          return '';
        }

        function extractSnippetFromTbody(tb) {
          const direct = tb.querySelectorAll(':scope > tr');
          for (let i = 0; i < direct.length; i++) {
            const s = rowSnippet(direct[i]);
            if (s) return s;
          }
          const nested = tb.querySelectorAll('tr');
          for (let j = 0; j < nested.length; j++) {
            const s = rowSnippet(nested[j]);
            if (s) return s;
          }
          return '';
        }

        /** Up to `max` distinct non-empty snippets from search rows (newest rows first in DOM). */
        function extractRecentSnippetsFromTbody(tb, max) {
          const cap = Math.max(1, Math.min(Number(max) || 5, 20));
          /** @type {string[]} */
          const out = [];
          const direct = tb.querySelectorAll(':scope > tr');
          const rows = direct.length ? Array.from(direct) : Array.from(tb.querySelectorAll('tr'));
          for (let i = 0; i < rows.length && out.length < cap; i++) {
            const s = rowSnippet(rows[i]);
            if (s && !out.includes(s)) out.push(s);
          }
          return out;
        }

        /** PII-safe layout hints for debug (no email bodies). */
        function buildDomDiag(xpathTbody, fallback) {
          const tbodies = document.querySelectorAll('tbody');
          let maxTrInAnyTbody = 0;
          let anyFirstRowTdCount = 0;
          let anyFirstRowSnippetLen = 0;
          for (let i = 0; i < tbodies.length; i++) {
            const tb = tbodies[i];
            const trs = tb.querySelectorAll('tr');
            if (trs.length > maxTrInAnyTbody) maxTrInAnyTbody = trs.length;
            if (anyFirstRowTdCount === 0 && trs[0]) {
              anyFirstRowTdCount = trs[0].querySelectorAll('td').length;
              const sp = trs[0].querySelector('td:nth-child(6) span');
              anyFirstRowSnippetLen = clean(sp?.textContent || '').length;
            }
          }
          return {
            hrefLen: String(location.href || '').length,
            hashLen: String(location.hash || '').length,
            readyState: String(document.readyState || ''),
            titleLen: String(document.title || '').length,
            xpathTbodyFound: !!xpathTbody,
            tbodyCount: tbodies.length,
            trCountDoc: document.querySelectorAll('tr').length,
            maxTrInAnyTbody,
            anyFirstRowTdCount,
            anyFirstRowSnippetLen,
            fallbackDirectTrCount: fallback?.directTrCount ?? 0,
          };
        }

        const deadline = Date.now() + maxWaitMs;
        /** @type {Record<string, unknown> | null} */
        let lastDiag = null;

        for (;;) {
          const xpathTb = xpathFirst(document, tbodyXPath);
          const fb = findLargestTbodyByDirectTr();
          /** @type {Array<{ tb: Element, source: string }>} */
          const candidates = [];
          if (xpathTb) candidates.push({ tb: xpathTb, source: 'xpath' });
          if (fb.el && (!xpathTb || fb.el !== xpathTb)) {
            candidates.push({ tb: fb.el, source: 'fallback_largest_tbody' });
          }

          for (let c = 0; c < candidates.length; c++) {
            const { tb, source } = candidates[c];
            const snippets = extractRecentSnippetsFromTbody(tb, 5);
            const rowCount = tb.querySelectorAll('tr').length;
            if (snippets.length > 0) {
              return {
                ok: true,
                lastMessageText: snippets[0],
                recentSnippets: snippets,
                rowCount,
                diag: {
                  ...buildDomDiag(xpathTb, fb),
                  snippetPick: source,
                  pickedRowCount: rowCount,
                },
              };
            }
          }

          lastDiag = {
            ...buildDomDiag(xpathTb, fb),
            snippetPick: null,
          };
          if (Date.now() >= deadline) break;
          await new Promise((r) => setTimeout(r, pollMs));
        }

        return { ok: false, error: 'gmail_results_tbody_miss', diag: lastDiag };
      },
      args: [GMAIL_SEARCH_RESULTS_TBODY_XPATH, listPollMs, listMaxWaitMs],
    });

    const res = injected?.[0]?.result;
    if (!res?.ok) {
      return {
        error:
          res?.error === 'gmail_results_tbody_miss'
            ? 'Could not find Gmail search results. Confirm Gmail is signed in and using default layout.'
            : res?.error || 'Gmail latest-message scrape failed.',
      };
    }
    const snippets = Array.isArray(res.recentSnippets) ? res.recentSnippets : [String(res.lastMessageText || '')];
    return {
      success: true,
      email: normalizedEmail,
      lastMessageText: String(res.lastMessageText || ''),
      recentSnippets: snippets.map((s) => String(s || '').trim()).filter(Boolean),
      searchUrl: targetUrl,
      rowCount: Number(res.rowCount) || 0,
    };
    }, { log, label: 'Gmail', restorePreviousTab: true });
  } catch (e) {
    return { error: e?.message || String(e) || 'Gmail latest-message scrape failed.' };
  }
}
