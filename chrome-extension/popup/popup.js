import { storage } from '../lib/storage.js';
import { conversationSummaryDisplayLine } from '../lib/conversation-summary-display.js';
import { checkAllNetworkLoginStatuses } from '../lib/login-status.js';

/**
 * @param {string} dotId
 * @param {boolean | null} status
 * @param {string} networkLabel
 * @param {string} signInHint
 */
function setLoginDot(dotId, status, networkLabel, signInHint) {
  const el = document.getElementById(dotId);
  if (!el) return;
  el.classList.remove('logged-in', 'logged-out');
  if (status === true) {
    el.classList.add('logged-in');
    el.title = `Logged in to ${networkLabel}`;
  } else if (status === false) {
    el.classList.add('logged-out');
    el.title = `Not logged in to ${networkLabel} — ${signInHint}`;
  } else {
    el.title = `${networkLabel} login status unknown`;
  }
}

async function refreshLoginStatuses() {
  const { linkedin, facebook, whatsapp, gmail } = await checkAllNetworkLoginStatuses();
  setLoginDot('linkedinLoginDot', linkedin, 'LinkedIn', 'sign in at linkedin.com');
  setLoginDot('facebookLoginDot', facebook, 'Facebook', 'sign in at facebook.com');
  setLoginDot('whatsappLoginDot', whatsapp, 'WhatsApp', 'open web.whatsapp.com and scan the QR code');
  setLoginDot('gmailLoginDot', gmail, 'Google', 'sign in at google.com');
}

document.addEventListener('DOMContentLoaded', () => {
  refreshLoginStatuses();

  const lastSyncEl = document.getElementById('lastSync');
  const linkedinStatusEl = document.getElementById('linkedinStatus');
  const facebookStatusEl = document.getElementById('facebookStatus');
  const whatsappStatusEl = document.getElementById('whatsappStatus');
  const gmailStatusEl = document.getElementById('gmailStatus');
  const syncBtn = document.getElementById('syncBtn');
  const searchInput = document.getElementById('searchInput');
  const recentList = document.getElementById('recentList');
  const openContactsBtn = document.getElementById('openContacts');
  const contactTotalCountEl = document.getElementById('contactTotalCount');

  async function openOrFocusContacts(url) {
    const [existingTab] = await chrome.tabs.query({
      url: chrome.runtime.getURL('pages/contacts.html') + '*',
    });
    if (existingTab) {
      await chrome.tabs.update(existingTab.id, { active: true });
      await chrome.windows.update(existingTab.windowId, { focused: true });
      return;
    }
    chrome.tabs.create({ url });
  }

  openContactsBtn.addEventListener('click', () => {
    openOrFocusContacts(chrome.runtime.getURL('pages/contacts.html'));
  });

  function updateSyncState(state) {
    if (!state) return;
    lastSyncEl.textContent = state.lastSync
      ? new Date(state.lastSync).toLocaleString()
      : 'Never';
    const linkedin = state.platformStatus?.linkedin;
    const facebook = state.platformStatus?.facebook;
    const whatsapp = state.platformStatus?.whatsapp;
    const gmail = state.platformStatus?.gmail;
    linkedinStatusEl.className = 'platform-badge ' + (linkedin?.success ? 'success' : linkedin?.error ? 'error' : '');
    facebookStatusEl.className = 'platform-badge ' + (facebook?.success ? 'success' : facebook?.error ? 'error' : '');
    whatsappStatusEl.className = 'platform-badge ' + (whatsapp?.success ? 'success' : whatsapp?.error ? 'error' : '');
    if (gmailStatusEl) {
      gmailStatusEl.className = 'platform-badge ' + (gmail?.success ? 'success' : gmail?.error ? 'error' : '');
    }
    const errEl = document.getElementById('errorMsg');
    const messages = [];
    if (linkedin?.error) {
      let msg = linkedin.error;
      if (msg.includes('Open LinkedIn Connections in a tab')) msg = 'LinkedIn: Sign in at linkedin.com and click Sync again.';
      else msg = 'LinkedIn: ' + msg;
      messages.push(msg);
    }
    if (facebook?.error) {
      messages.push('Facebook: ' + facebook.error);
    }
    if (whatsapp?.error) {
      messages.push('WhatsApp: ' + whatsapp.error);
    }
    if (gmail?.error) {
      messages.push('Gmail: ' + gmail.error);
    }
    if (messages.length) {
      errEl.textContent = messages.join(' ');
      errEl.classList.remove('hidden');
    } else {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }
  }

  function updateRecent(contacts) {
    recentList.innerHTML = '';
    if (!contacts?.length) {
      recentList.innerHTML = '<li class="empty-state">No contacts yet. Sync to get started.</li>';
      return;
    }
    for (const c of contacts) {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="contact-name">${escapeHtml(c.displayName)}</div>
        ${
          c.conversationSummary
            ? (() => {
                const line = conversationSummaryDisplayLine(c);
                const short = line.length > 60 ? `${line.slice(0, 60)}…` : line;
                return `<div class="contact-summary">${escapeHtml(short)}</div>`;
              })()
            : ''
        }
      `;
      li.addEventListener('click', () => {
        openOrFocusContacts(chrome.runtime.getURL(`pages/contacts.html?id=${c.id}`));
      });
      recentList.appendChild(li);
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function setTotalContactCount(n) {
    if (!contactTotalCountEl) return;
    const num = typeof n === 'number' && Number.isFinite(n) ? n : 0;
    contactTotalCountEl.textContent = num > 0 ? `(${num.toLocaleString()} total)` : '';
  }

  function refreshRecentFromDb() {
    return storage
      .getAllContacts()
      .then((contacts) => {
        setTotalContactCount(contacts.length);
        const sorted = contacts
          .sort((a, b) => new Date(b.lastInteraction || 0) - new Date(a.lastInteraction || 0))
          .slice(0, 5);
        updateRecent(sorted);
      })
      .catch((e) => {
        console.error('[PRM popup] getAllContacts failed:', e);
        setTotalContactCount(0);
        updateRecent([]);
      });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.prmContactsSyncStamp) return;
    const n = changes.prmContactsTotalCount?.newValue;
    if (typeof n === 'number') setTotalContactCount(n);
    refreshRecentFromDb();
  });

  // Use storage directly so IndexedDB is opened in popup context (visible in DevTools)
  console.log('[PRM popup] Loading sync state and contacts from IndexedDB');
  storage.getSyncState().then(updateSyncState).catch((e) => {
    console.error('[PRM popup] getSyncState failed:', e);
    updateSyncState(null);
  });
  refreshRecentFromDb();

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing...';
    console.log('[PRM popup] Sync clicked');
    try {
      const result = await chrome.runtime.sendMessage({ action: 'SYNC' });
      console.log('[PRM popup] Sync result:', result);
      if (result?.error) throw new Error(result.error);
      updateSyncState(result);
      await refreshRecentFromDb();
    } catch (e) {
      console.error('[PRM popup] Sync error:', e);
      lastSyncEl.textContent = 'Error: ' + e.message;
    }
    syncBtn.disabled = false;
    syncBtn.textContent = 'Sync Now';
  });
  syncBtn.title =
    'Syncs enabled networks (LinkedIn, Facebook, WhatsApp, Google Contacts) in the background.';

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = searchInput.value.trim();
      if (q) {
        openOrFocusContacts(chrome.runtime.getURL(`pages/contacts.html?q=${encodeURIComponent(q)}`));
      }
    }
  });
});
