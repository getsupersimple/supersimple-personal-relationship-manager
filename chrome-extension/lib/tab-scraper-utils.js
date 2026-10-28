/**
 * Shared utilities for background-tab scrapers.
 * Every scraper that opens an inactive tab and polls for DOM content uses these.
 */

export const TAB_LOAD_TIMEOUT_MS = 120000;

/** @param {number} ms */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Resolves when the tab reaches `status === 'complete'`, rejects on timeout.
 * @param {number} tabId
 * @param {string} [label] - included in the timeout error message
 * @returns {Promise<void>}
 */
export function waitForTabLoadComplete(tabId, label = 'Tab') {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { chrome.tabs.onUpdated.removeListener(onUpdated); } catch (_) {}
      if (err) reject(err); else resolve();
    };

    const timer = setTimeout(
      () => finish(new Error(`${label} load timeout`)),
      TAB_LOAD_TIMEOUT_MS,
    );

    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') finish(null);
    }

    chrome.tabs.onUpdated.addListener(onUpdated);

    // Check immediately in case the tab already completed before we attached.
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') finish(null);
    }).catch((e) => finish(e));
  });
}

/**
 * Open a new inactive background tab, run `fn(tabId)`, then close the tab.
 * Optionally saves the currently active tab and restores it after.
 *
 * @param {string} url
 * @param {(tabId: number) => Promise<T>} fn
 * @param {{ log?: (...a: unknown[]) => void, label?: string, restorePreviousTab?: boolean }} [options]
 * @returns {Promise<T>}
 * @template T
 */
export async function withBackgroundTab(url, fn, options = {}) {
  const log = options.log || (() => {});
  const label = options.label || 'Tab';
  const restorePreviousTab = options.restorePreviousTab ?? false;

  let tabId = null;
  let previousActiveTabId = null;

  if (restorePreviousTab) {
    try {
      const prevTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const pid = prevTabs[0]?.id;
      if (pid != null) previousActiveTabId = pid;
    } catch (_) {}
  }

  try {
    log(`${label}: creating background tab`, url);
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;
    if (tabId == null) throw new Error(`Could not create background tab for ${label}.`);
    if (previousActiveTabId === tabId) previousActiveTabId = null;

    await waitForTabLoadComplete(tabId, label);

    return await fn(tabId);
  } finally {
    if (restorePreviousTab && previousActiveTabId != null) {
      try { await chrome.tabs.update(previousActiveTabId, { active: true }); } catch (_) {}
    }
    if (tabId != null) {
      try {
        await chrome.tabs.remove(tabId);
        log(`${label}: closed background tab`, tabId);
      } catch (_) {}
    }
  }
}
