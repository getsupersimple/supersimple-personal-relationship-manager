/**
 * Settings page - WebLLM model, debug options (auto-saved on change)
 */
import { storage } from '../lib/storage.js';
import {
  downloadPlatformContactsCsv,
  importPlatformContactsCsv,
  downloadAllContactsCsv,
  importAllContactsCsv,
  downloadFactoidsCsv,
  importFactoidsCsv,
} from '../lib/network-contact-csv.js';
import { checkAllNetworkLoginStatuses } from '../lib/login-status.js';
import { initModelDownloadBanner } from '../lib/model-download-banner.js';
import { DEFAULT_MODEL, LOCAL_LLM_MODEL_ID } from '../lib/model-ids.js';
import { populateModelSelect } from '../lib/webllm-model-select.js';
import { paginationDelayFromInput, resolvePaginationDelayMs } from '../lib/pagination-delay.js';

const DEFAULT_RECENT_MESSAGES_LIMIT = 5;

function updateLocalLlmVisibility(selectEl) {
  const group = document.getElementById('localLlmGroup');
  if (!group) return;
  group.style.display = selectEl.value === LOCAL_LLM_MODEL_ID ? 'block' : 'none';
}

function readSettingsFromForm() {
  const selectEl = document.getElementById('webllmModel');
  const localLlmBaseUrlInput = document.getElementById('localLlmBaseUrl');
  const localLlmModelInput = document.getElementById('localLlmModel');
  const localLlmApiKeyInput = document.getElementById('localLlmApiKey');
  const webllmModel = (selectEl?.value || '').trim() || DEFAULT_MODEL;
  const limitVal = (document.getElementById('importLimit')?.value || '').trim();
  const newLimit = limitVal ? Math.max(0, parseInt(limitVal, 10) || 0) : 0;
  const newDelayMs = paginationDelayFromInput(document.getElementById('paginationDelayMs')?.value);
  const refreshVal = (document.getElementById('conversationRefreshMinutes')?.value || '').trim();
  const newRefreshMinutes = refreshVal ? Math.max(0, parseInt(refreshVal, 10) || 0) : 0;
  const recentMessagesLimitVal = (document.getElementById('recentMessagesLimit')?.value || '').trim();
  const newRecentMessagesLimit = recentMessagesLimitVal
    ? Math.min(25, Math.max(1, parseInt(recentMessagesLimitVal, 10) || DEFAULT_RECENT_MESSAGES_LIMIT))
    : DEFAULT_RECENT_MESSAGES_LIMIT;
  const userName = (document.getElementById('userName')?.value || '').trim();
  return {
    webllmModel,
    userName,
    importLimit: newLimit,
    paginationDelayMs: newDelayMs,
    conversationRefreshMinutes: newRefreshMinutes,
    recentMessagesLimit: newRecentMessagesLimit,
    syncLinkedInEnabled: document.getElementById('syncLinkedInEnabled')?.checked !== false,
    syncFacebookEnabled: document.getElementById('syncFacebookEnabled')?.checked !== false,
    syncWhatsAppEnabled: document.getElementById('syncWhatsAppEnabled')?.checked !== false,
    syncGmailEnabled: document.getElementById('syncGmailEnabled')?.checked !== false,
    localLlmBaseUrl: localLlmBaseUrlInput ? localLlmBaseUrlInput.value.trim() : '',
    localLlmModel: localLlmModelInput ? localLlmModelInput.value.trim() : '',
    localLlmApiKey: localLlmApiKeyInput ? localLlmApiKeyInput.value.trim() : '',
  };
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

let statusClearTimer;

/**
 * Show a message in the Settings status line; `clearMs` blanks it again after that long, `error` styles it as a failure.
 * @param {string} text
 * @param {{ error?: boolean, clearMs?: number }} [options]
 */
function showSettingsStatus(text, { error = false, clearMs = 0 } = {}) {
  const el = document.getElementById('settingsSaveStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', error);
  clearTimeout(statusClearTimer);
  if (clearMs) {
    statusClearTimer = setTimeout(() => {
      el.textContent = '';
    }, clearMs);
  }
}

async function persistSettings() {
  try {
    await chrome.storage.local.set(readSettingsFromForm());
    showSettingsStatus('Saved', { clearMs: 2000 });
  } catch (e) {
    showSettingsStatus(e?.message || 'Save failed', { error: true });
  }
}

const debouncedPersistSettings = debounce(persistSettings, 450);

/**
 * @param {string} anchorId
 * @param {'linkedin' | 'facebook' | 'whatsapp' | 'gmail'} platform
 * @param {string} label
 */
function wireClearNetworkContacts(anchorId, platform, label) {
  const a = document.getElementById(anchorId);
  if (!a) return;
  a.addEventListener('click', async (e) => {
    e.preventDefault();
    const all = await storage.getAllContacts();
    const count = all.filter((c) => Boolean(c?.platforms?.[platform])).length;
    if (
      !window.confirm(
        `Remove ${count} ${label} contacts? Contacts that only had ${label} will be deleted; merged cards keep other networks. Summaries and conversations for ${label} are removed. This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      const { removedContacts, updatedContacts } = await storage.clearNetworkPlatform(platform);
      showSettingsStatus(`Cleared ${label}: ${removedContacts} contact(s) removed, ${updatedContacts} updated (platform stripped).`, { clearMs: 6000 });
    } catch (err) {
      showSettingsStatus(err?.message || String(err), { error: true });
    }
  });
}

/** @param {string} anchorId */
function wireClearAllContacts(anchorId) {
  const a = document.getElementById(anchorId);
  if (!a) return;
  a.addEventListener('click', async (e) => {
    e.preventDefault();
    const all = await storage.getAllContacts();
    const count = all.length;
    if (
      !window.confirm(
        `Remove ALL ${count} contact(s) across every network (LinkedIn, Facebook, WhatsApp, Gmail)? This also deletes all factoids and conversation summaries. This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      const { removedContacts } = await storage.clearAllContacts();
      showSettingsStatus(`Cleared all contacts: ${removedContacts} contact(s) removed.`, { clearMs: 6000 });
    } catch (err) {
      showSettingsStatus(err?.message || String(err), { error: true });
    }
  });
}

/**
 * Disable a network's sync toggle when we can confirm the user is logged out — never on `null`
 * (unknown), since that would wrongly block a network we simply couldn't check (e.g. WhatsApp
 * with no open tab). Doesn't touch the stored on/off preference, only whether it can be changed.
 * @param {string} checkboxId
 * @param {string} noteId
 * @param {boolean | null} status
 */
function applyNetworkLoginStatus(checkboxId, noteId, status) {
  const checkbox = document.getElementById(checkboxId);
  const note = document.getElementById(noteId);
  if (!checkbox) return;
  if (status === false) {
    checkbox.disabled = true;
    checkbox.title = 'Not logged in — log in to this network to enable syncing.';
    note?.classList.remove('hidden');
  } else {
    checkbox.disabled = false;
    checkbox.title = '';
    note?.classList.add('hidden');
  }
}

async function refreshNetworkLoginStatuses() {
  const { linkedin, facebook, whatsapp, gmail } = await checkAllNetworkLoginStatuses();
  applyNetworkLoginStatus('syncLinkedInEnabled', 'linkedInLoginNote', linkedin);
  applyNetworkLoginStatus('syncFacebookEnabled', 'facebookLoginNote', facebook);
  applyNetworkLoginStatus('syncWhatsAppEnabled', 'whatsAppLoginNote', whatsapp);
  applyNetworkLoginStatus('syncGmailEnabled', 'gmailLoginNote', gmail);
}

/**
 * Wire the factoids-only backup/restore links: export every factoid as CSV, and import merges
 * incoming rows into each contact's existing factoids by contactId (deterministic per platform
 * identity, so a fresh resync reattaches them automatically) rather than replacing them outright.
 * @param {string} exportAnchorId
 * @param {string} importAnchorId
 * @param {string} fileInputId
 */
function wireFactoidsBackup(exportAnchorId, importAnchorId, fileInputId) {
  const exportA = document.getElementById(exportAnchorId);
  const importA = document.getElementById(importAnchorId);
  const fileEl = document.getElementById(fileInputId);
  if (!exportA || !importA || !fileEl) return;

  exportA.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await downloadFactoidsCsv();
      showSettingsStatus('Factoids exported.', { clearMs: 4000 });
    } catch (err) {
      showSettingsStatus(err?.message || String(err), { error: true });
    }
  });

  importA.addEventListener('click', (e) => {
    e.preventDefault();
    fileEl.value = '';
    fileEl.click();
  });

  fileEl.addEventListener('change', async () => {
    const f = fileEl.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const { importedRows, matchedContacts, unmatchedContacts } = await importFactoidsCsv(text);
      const tail = unmatchedContacts > 0 ? `, ${unmatchedContacts} waiting on a resync to reattach.` : '.';
      showSettingsStatus(`Factoids import: ${importedRows} row(s) merged into ${matchedContacts} synced contact(s)${tail}`, { clearMs: 8000 });
    } catch (err) {
      showSettingsStatus(err?.message || String(err), { error: true });
    } finally {
      fileEl.value = '';
    }
  });
}

/** Wire each network row's "⋮" button to toggle its Import/Clear dropdown, closing on outside click. */
function wireNetworkMenus() {
  const menus = Array.from(document.querySelectorAll('.network-menu'));

  function closeMenu(menu) {
    menu.querySelector('.network-menu-dropdown')?.classList.add('hidden');
    menu.querySelector('.network-menu-btn')?.setAttribute('aria-expanded', 'false');
  }

  menus.forEach((menu) => {
    const btn = menu.querySelector('.network-menu-btn');
    const dropdown = menu.querySelector('.network-menu-dropdown');
    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasHidden = dropdown.classList.contains('hidden');
      menus.forEach(closeMenu);
      if (wasHidden) {
        dropdown.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
      }
    });

    dropdown.querySelectorAll('a').forEach((item) => {
      item.addEventListener('click', () => closeMenu(menu));
    });
  });

  document.addEventListener('click', () => menus.forEach(closeMenu));
}

document.addEventListener('DOMContentLoaded', async () => {
  const {
    webllmModel,
    userName,
    importLimit,
    paginationDelayMs,
    conversationRefreshMinutes,
    recentMessagesLimit,
    syncLinkedInEnabled,
    syncFacebookEnabled,
    syncWhatsAppEnabled,
    syncGmailEnabled,
    localLlmBaseUrl,
    localLlmModel,
    localLlmApiKey,
  } =
    await chrome.storage.local.get([
      'webllmModel',
      'userName',
      'importLimit',
      'paginationDelayMs',
      'conversationRefreshMinutes',
      'recentMessagesLimit',
      'syncLinkedInEnabled',
      'syncFacebookEnabled',
      'syncWhatsAppEnabled',
      'syncGmailEnabled',
      'localLlmBaseUrl',
      'localLlmModel',
      'localLlmApiKey',
    ]);
  const userNameInput = document.getElementById('userName');
  if (userNameInput) {
    userNameInput.value = userName || '';
    userNameInput.addEventListener('input', () => debouncedPersistSettings());
  }

  const selectEl = document.getElementById('webllmModel');
  populateModelSelect(selectEl, webllmModel);
  const { prmProviderMigrationNotice } = await chrome.storage.local.get('prmProviderMigrationNotice');
  const noticeEl = document.getElementById('providerNotice');
  if (noticeEl && prmProviderMigrationNotice) {
    noticeEl.textContent = prmProviderMigrationNotice;
    noticeEl.style.display = 'block';
    await chrome.storage.local.remove('prmProviderMigrationNotice');
  }
  updateLocalLlmVisibility(selectEl);
  selectEl.addEventListener('change', () => {
      updateLocalLlmVisibility(selectEl);
    void persistSettings();
  });

  const localLlmBaseUrlInput = document.getElementById('localLlmBaseUrl');
  if (localLlmBaseUrlInput) {
    localLlmBaseUrlInput.value = localLlmBaseUrl || '';
    localLlmBaseUrlInput.addEventListener('input', () => debouncedPersistSettings());
  }
  const localLlmModelInput = document.getElementById('localLlmModel');
  if (localLlmModelInput) {
    localLlmModelInput.value = localLlmModel || '';
    localLlmModelInput.addEventListener('input', () => debouncedPersistSettings());
  }
  const localLlmApiKeyInput = document.getElementById('localLlmApiKey');
  if (localLlmApiKeyInput) {
    localLlmApiKeyInput.value = localLlmApiKey || '';
    localLlmApiKeyInput.addEventListener('input', () => debouncedPersistSettings());
  }

  const importLimitEl = document.getElementById('importLimit');
  importLimitEl.value = importLimit ?? '';
  importLimitEl.addEventListener('input', () => debouncedPersistSettings());
  importLimitEl.addEventListener('change', () => void persistSettings());

  const paginationEl = document.getElementById('paginationDelayMs');
  paginationEl.value = resolvePaginationDelayMs(paginationDelayMs);
  paginationEl.addEventListener('input', () => debouncedPersistSettings());
  paginationEl.addEventListener('change', () => void persistSettings());

  const conversationRefreshEl = document.getElementById('conversationRefreshMinutes');
  conversationRefreshEl.value = conversationRefreshMinutes ?? '';
  conversationRefreshEl.addEventListener('input', () => debouncedPersistSettings());
  conversationRefreshEl.addEventListener('change', () => void persistSettings());

  const recentMessagesLimitEl = document.getElementById('recentMessagesLimit');
  recentMessagesLimitEl.value = recentMessagesLimit ?? DEFAULT_RECENT_MESSAGES_LIMIT;
  recentMessagesLimitEl.addEventListener('input', () => debouncedPersistSettings());
  recentMessagesLimitEl.addEventListener('change', () => void persistSettings());

  document.getElementById('syncLinkedInEnabled').checked = syncLinkedInEnabled !== false;
  document.getElementById('syncFacebookEnabled').checked = syncFacebookEnabled !== false;
  document.getElementById('syncWhatsAppEnabled').checked = syncWhatsAppEnabled !== false;
  document.getElementById('syncGmailEnabled').checked = syncGmailEnabled !== false;
  document.getElementById('syncLinkedInEnabled').addEventListener('change', () => void persistSettings());
  document.getElementById('syncFacebookEnabled').addEventListener('change', () => void persistSettings());
  document.getElementById('syncWhatsAppEnabled').addEventListener('change', () => void persistSettings());
  document.getElementById('syncGmailEnabled').addEventListener('change', () => void persistSettings());

  wireClearNetworkContacts('clearLinkedInContacts', 'linkedin', 'LinkedIn');
  wireClearNetworkContacts('clearFacebookContacts', 'facebook', 'Facebook');
  wireClearNetworkContacts('clearWhatsAppContacts', 'whatsapp', 'WhatsApp');
  wireClearNetworkContacts('clearGmailContacts', 'gmail', 'Gmail');
  wireClearAllContacts('clearAllContacts');
  wireNetworkMenus();
  wireFactoidsBackup('exportFactoidsCsv', 'importFactoidsCsv', 'importFactoidsFile');

  refreshNetworkLoginStatuses();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshNetworkLoginStatuses();
  });

  initModelDownloadBanner();

  /**
   * @param {string} exportAnchorId
   * @param {string} importAnchorId
   * @param {string} fileInputId
   * @param {string} label
   * @param {() => Promise<void>} exportFn
   * @param {(text: string) => Promise<{ importedRows: number, totalContacts: number }>} importFn
   */
  function wireExportImport(exportAnchorId, importAnchorId, fileInputId, label, exportFn, importFn) {
    const exportA = document.getElementById(exportAnchorId);
    const importA = document.getElementById(importAnchorId);
    const fileEl = document.getElementById(fileInputId);
    if (!exportA || !importA || !fileEl) return;

    exportA.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await exportFn();
        showSettingsStatus(`${label} contacts exported.`, { clearMs: 4000 });
      } catch (err) {
        showSettingsStatus(err?.message || String(err), { error: true });
      }
    });

    importA.addEventListener('click', (e) => {
      e.preventDefault();
      fileEl.value = '';
      fileEl.click();
    });

    fileEl.addEventListener('change', async () => {
      const f = fileEl.files?.[0];
      if (!f) return;
      try {
        const text = await f.text();
        const { importedRows, totalContacts } = await importFn(text);
        showSettingsStatus(`${label} import: ${importedRows} row(s) merged, ${totalContacts} contact(s) total.`, { clearMs: 8000 });
      } catch (err) {
        showSettingsStatus(err?.message || String(err), { error: true });
      } finally {
        fileEl.value = '';
      }
    });
  }

  wireExportImport(
    'exportLinkedInCsv',
    'importLinkedInCsv',
    'importLinkedInFile',
    'LinkedIn',
    () => downloadPlatformContactsCsv('linkedin'),
    (text) => importPlatformContactsCsv('linkedin', text),
  );
  wireExportImport(
    'exportFacebookCsv',
    'importFacebookCsv',
    'importFacebookFile',
    'Facebook',
    () => downloadPlatformContactsCsv('facebook'),
    (text) => importPlatformContactsCsv('facebook', text),
  );
  wireExportImport(
    'exportWhatsAppCsv',
    'importWhatsAppCsv',
    'importWhatsAppFile',
    'WhatsApp',
    () => downloadPlatformContactsCsv('whatsapp'),
    (text) => importPlatformContactsCsv('whatsapp', text),
  );
  wireExportImport(
    'exportGmailCsv',
    'importGmailCsv',
    'importGmailFile',
    'Gmail',
    () => downloadPlatformContactsCsv('gmail'),
    (text) => importPlatformContactsCsv('gmail', text),
  );
  wireExportImport(
    'exportAllCsv',
    'importAllCsv',
    'importAllFile',
    'All',
    () => downloadAllContactsCsv(),
    (text) => importAllContactsCsv(text),
  );
});
