/**
 * Contacts full-page UI - contact list, search, detail view
 * Uses storage directly so IndexedDB is opened in this page's context (visible in DevTools)
 */
import { storage } from '../lib/storage.js';
import {
  conversationSummaryDisplayLine,
  conversationSummaryPlatformLabel,
} from '../lib/conversation-summary-display.js';
import { formatRecentMessagesForSummary } from '../lib/format-recent-messages-for-summary.js';
import { getEffectiveContactIds } from '../lib/contact-effective-ids.js';
import { initModelDownloadBanner } from '../lib/model-download-banner.js';
import { initWebLLMModelSelect } from '../lib/webllm-model-select.js';
import {
  factoidKeyNorm,
  isNotesKey,
  NOTES_KEY_CANONICAL,
  NOTES_SEPARATOR,
  mergeParsedFactoids,
  looksAdditive,
} from '../lib/factoid-merge.js';

const contactList = document.getElementById('contactList');
const detailEmpty = document.getElementById('detailEmpty');
const detailContent = document.getElementById('detailContent');
const searchInput = document.getElementById('searchInput');
const filterLinkedIn = document.getElementById('filterLinkedIn');
const filterFacebook = document.getElementById('filterFacebook');
const filterWhatsApp = document.getElementById('filterWhatsApp');
const filterGmail = document.getElementById('filterGmail');
const countLinkedInEl = document.getElementById('countLinkedIn');
const countFacebookEl = document.getElementById('countFacebook');
const countWhatsAppEl = document.getElementById('countWhatsApp');
const countGmailEl = document.getElementById('countGmail');
const filterToggle = document.getElementById('filterToggle');
const filterContent = document.getElementById('filterContent');
const sortOrderSelect = document.getElementById('sortOrder');

const FILTER_OPEN_KEY = 'prm-contacts-filter-open';
const SORT_ORDER_KEY = 'prm-contacts-sort-order';
/** Persisted search + network checkboxes (reload-safe). */
const LIST_FILTERS_KEY = 'prm-contacts-list-filters';

function readListFilters() {
  try {
    const raw = localStorage.getItem(LIST_FILTERS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return o;
  } catch (_) {
    return null;
  }
}

function persistListFilters() {
  try {
    localStorage.setItem(
      LIST_FILTERS_KEY,
      JSON.stringify({
        search: searchInput.value,
        linkedin: filterLinkedIn.checked,
        facebook: filterFacebook.checked,
        whatsapp: filterWhatsApp.checked,
        gmail: filterGmail.checked,
      }),
    );
  } catch (_) {}
}

const PAST_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_ACCESSES_CAP = 500;

/** DevTools-friendly ms → ISO for timing logs */
function msToIsoLog(ms) {
  const n = Number(ms) || 0;
  return n > 0 ? new Date(n).toISOString() : '(none)';
}

function getAccessCountPast30Days(contact) {
  const arr = contact.recentAccesses;
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  const cutoff = Date.now() - PAST_MONTH_MS;
  return arr.filter((ts) => new Date(ts).getTime() >= cutoff).length;
}

function trimRecentAccesses(arr) {
  if (!Array.isArray(arr)) return [];
  const cutoff = Date.now() - PAST_MONTH_MS;
  return arr
    .filter((ts) => new Date(ts).getTime() >= cutoff)
    .sort()
    .slice(-RECENT_ACCESSES_CAP);
}

let contacts = [];

function updateNetworkCounts() {
  const linkedinCount = contacts.filter((c) => c.platforms?.linkedin).length;
  const facebookCount = contacts.filter((c) => c.platforms?.facebook).length;
  const whatsappCount = contacts.filter((c) => c.platforms?.whatsapp).length;
  const gmailCount = contacts.filter((c) => c.platforms?.gmail).length;
  countLinkedInEl.textContent = `(${linkedinCount.toLocaleString()})`;
  countFacebookEl.textContent = `(${facebookCount.toLocaleString()})`;
  countWhatsAppEl.textContent = `(${whatsappCount.toLocaleString()})`;
  if (countGmailEl) countGmailEl.textContent = `(${gmailCount.toLocaleString()})`;
}
/** @type {Record<string, { id: string, key: string, value: string, source?: string }[]>} */
let factoidsByContactId = {};
let selectedId = null;


function escapeHtml(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function filterContacts() {
  const q = searchInput.value.toLowerCase().trim();
  const terms = q.split(/\s+/).filter(Boolean);
  const linkedin = filterLinkedIn.checked;
  const facebook = filterFacebook.checked;
  const whatsapp = filterWhatsApp.checked;
  const gmail = filterGmail.checked;
  return contacts.filter((c) => {
    const matchPlatform =
      (linkedin && c.platforms?.linkedin) ||
      (facebook && c.platforms?.facebook) ||
      (whatsapp && c.platforms?.whatsapp) ||
      (gmail && c.platforms?.gmail);
    if (!matchPlatform) return false;
    if (!terms.length) return true;
    const effectiveIds = getEffectiveContactIds(c);
    const factoids = effectiveIds.flatMap((cid) => factoidsByContactId[cid] || []);
    const summaryLine = conversationSummaryDisplayLine(c);
    const searchable = [
      c.displayName,
      c.primaryEmail,
      c.conversationSummary,
      c.conversationSummaryPlatform,
      summaryLine,
      c.platforms?.linkedin?.company,
      c.platforms?.linkedin?.headline,
    ]
      .concat(factoids.flatMap((f) => [f.key, f.value]))
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    // Every term must match somewhere in the combined fields, so a query like
    // "jane austria" can match a name and a factoid value independently.
    return terms.every((term) => searchable.includes(term));
  });
}

function sortContacts(list) {
  const order = sortOrderSelect.value;
  const copy = list.slice();
  if (order === 'alphabetical') {
    copy.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', undefined, { sensitivity: 'base' }));
  } else if (order === 'last-accessed') {
    copy.sort((a, b) => {
      const ta = new Date(a.lastInteraction || 0).getTime();
      const tb = new Date(b.lastInteraction || 0).getTime();
      return tb - ta;
    });
  } else if (order === 'most-accessed') {
    copy.sort((a, b) => {
      const na = getAccessCountPast30Days(a);
      const nb = getAccessCountPast30Days(b);
      return nb - na;
    });
  } else if (order === 'common-connections') {
    copy.sort((a, b) => {
      const na = Math.max(
        a.platforms?.linkedin?.commonConnectionCount ?? 0,
        a.platforms?.facebook?.commonFriendCount ?? 0,
        a.platforms?.whatsapp?.isDirectChat ? 1 : 0
      );
      const nb = Math.max(
        b.platforms?.linkedin?.commonConnectionCount ?? 0,
        b.platforms?.facebook?.commonFriendCount ?? 0,
        b.platforms?.whatsapp?.isDirectChat ? 1 : 0
      );
      return nb - na;
    });
  }
  return copy;
}

function formatConnectedDate(contact) {
  const dateStr = contact.platforms?.linkedin?.connectedOn || contact.addedAt || contact.lastInteraction;
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return 'Connected ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function renderContactList(filtered) {
  contactList.innerHTML = '';
  for (const c of filtered) {
    const li = document.createElement('li');
    li.dataset.id = c.id;
    li.className = selectedId === c.id ? 'active' : '';
    const meta = c.primaryEmail || Object.keys(c.platforms || {}).join(', ');
    const connected = formatConnectedDate(c);
    li.innerHTML = `
      <div class="contact-name">${escapeHtml(c.displayName)}</div>
      <div class="contact-meta">${escapeHtml(meta)}</div>
      ${connected ? `<div class="contact-added">${escapeHtml(connected)}</div>` : ''}
    `;
    li.addEventListener('click', () => selectContact(c.id));
    contactList.appendChild(li);
  }
}

/**
 * Wrap a platform tag's inner HTML with a close ("×") icon when that platform was merged in from
 * a separate contact — clicking it undoes the merge. Platforms added natively (blob.id === contact.id,
 * or no id at all) render unchanged.
 * @param {string} key - platform key, e.g. 'linkedin'
 * @param {string} label - display label, e.g. 'LinkedIn'
 * @param {object} blob - contact.platforms[key]
 * @param {string} contactId
 * @param {string} innerHtml - the already-built <a>/<span class="platform-tag"> markup
 */
function wrapPlatformTagWithUndo(key, label, blob, contactId, innerHtml) {
  if (!blob?.id || blob.id === contactId) return innerHtml;
  return `<span class="platform-tag-wrap">${innerHtml}<button type="button" class="platform-tag-close" data-platform="${escapeHtml(key)}" title="Undo merge (${escapeHtml(label)})" aria-label="Undo merge (${escapeHtml(label)})">&times;</button></span>`;
}

function selectContact(id) {
  selectedId = id;
  const contact = contacts.find((c) => c.id === id);
  if (!contact) return;
  const now = new Date().toISOString();
  contact.lastInteraction = now;
  if (!contact.recentAccesses) contact.recentAccesses = [];
  contact.recentAccesses.push(now);
  contact.recentAccesses = trimRecentAccesses(contact.recentAccesses);
  storage.saveContact(contact).catch((e) => console.warn('[PRM contacts] Failed to update contact:', e));
  detailEmpty.classList.add('hidden');
  detailContent.classList.remove('hidden');
  document.getElementById('detailName').textContent = contact.displayName;
  const platforms = [];
  if (contact.platforms?.gmail) {
    const gmailBlob = contact.platforms.gmail;
    const email = gmailBlob.email || contact.primaryEmail || '';
    const title = email ? `Gmail: ${email}` : 'Gmail';
    const inner = email
      ? `<a class="platform-tag" href="mailto:${escapeHtml(email)}" title="${escapeHtml(title)}">Gmail</a>`
      : `<span class="platform-tag" title="${escapeHtml(title)}">Gmail</span>`;
    platforms.push(wrapPlatformTagWithUndo('gmail', 'Gmail', gmailBlob, contact.id, inner));
  }
  if (contact.platforms?.linkedin) {
    const liBlob = contact.platforms.linkedin;
    const liId = liBlob.id || liBlob.profileUrl || contact.id;
    const profileUrl = liBlob.profileUrl;
    const title = liId ? `LinkedIn ID: ${liId}` : 'LinkedIn';
    const inner = profileUrl
      ? `<a class="platform-tag" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener" title="${escapeHtml(
          title,
        )}">LinkedIn</a>`
      : `<span class="platform-tag" title="${escapeHtml(title)}">LinkedIn</span>`;
    platforms.push(wrapPlatformTagWithUndo('linkedin', 'LinkedIn', liBlob, contact.id, inner));
  }
  if (contact.platforms?.facebook) {
    const fbBlob = contact.platforms.facebook;
    const fbId = fbBlob.id || fbBlob.profileUrl || contact.id;
    const fbUrl = fbBlob.profileUrl;
    const title = fbId ? `Facebook ID: ${fbId}` : 'Facebook';
    const inner = fbUrl
      ? `<a class="platform-tag" href="${escapeHtml(fbUrl)}" target="_blank" rel="noopener" title="${escapeHtml(
          title,
        )}">Facebook</a>`
      : `<span class="platform-tag" title="${escapeHtml(title)}">Facebook</span>`;
    platforms.push(wrapPlatformTagWithUndo('facebook', 'Facebook', fbBlob, contact.id, inner));
  }
  if (contact.platforms?.whatsapp) {
    const waBlob = contact.platforms.whatsapp;
    const waId = waBlob.id || waBlob.chatKey || contact.id;
    const waUrl = waBlob.profileUrl || 'https://web.whatsapp.com/';
    const title = waId ? `WhatsApp ID: ${waId}` : 'WhatsApp';
    const inner = `<a class="platform-tag" href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" title="${escapeHtml(
      title,
    )}">WhatsApp</a>`;
    platforms.push(wrapPlatformTagWithUndo('whatsapp', 'WhatsApp', waBlob, contact.id, inner));
  }
  const detailPlatformsEl = document.getElementById('detailPlatforms');
  detailPlatformsEl.innerHTML = platforms.join('');
  detailPlatformsEl.querySelectorAll('.platform-tag-close').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleUndoMerge(contact, btn.dataset.platform);
    });
  });
  // Deprecated separate profile links; keep containers hidden.
  const linkedinUrlEl = document.getElementById('detailLinkedInUrl');
  if (linkedinUrlEl) {
    linkedinUrlEl.innerHTML = '';
    linkedinUrlEl.classList.add('hidden');
  }
  const facebookUrlEl = document.getElementById('detailFacebookUrl');
  if (facebookUrlEl) {
    facebookUrlEl.innerHTML = '';
    facebookUrlEl.classList.add('hidden');
  }
  const whatsappUrlEl = document.getElementById('detailWhatsAppUrl');
  if (whatsappUrlEl) {
    whatsappUrlEl.innerHTML = '';
    whatsappUrlEl.classList.add('hidden');
  }
  renderFactoidsForContact(contact);
  loadLatestMessages(contact);
  renderMergeAndUndo(contact);
  renderContactList(sortContacts(filterContacts()));
}

/**
 * @param {HTMLElement} cardEl - .latest-message-card
 * @param {string} platformKey - e.g. gmail, linkedin
 * @param {string} messageBody - preview text only (no network prefix)
 * @param {string} [summarizedSourceText] - raw thread text sent to the summarizer (shown under summary when set)
 * @param {string} [sourceUrl] - URL where summarized text was fetched from
 * @param {string} [sourceDebugText]
 */
function setLatestMessageCard(
  cardEl,
  platformKey,
  messageBody,
  summarizedSourceText,
  sourceUrl,
  sourceDebugText,
) {
  const label = conversationSummaryPlatformLabel(platformKey) || platformKey;
  const netEl = cardEl.querySelector('.latest-message-network');
  const bodyEl = cardEl.querySelector('.latest-message-body');
  const sourceBlock = cardEl.querySelector('.latest-message-source-block');
  const sourceDetailsEl = cardEl.querySelector('.latest-message-source-details');
  const sourceToggleEl = cardEl.querySelector('.latest-message-source-toggle');
  const sourceTextEl = cardEl.querySelector('.latest-message-source-text');
  const sourceUrlEl = cardEl.querySelector('.latest-message-source-url');
  const sourceDebugEl = cardEl.querySelector('.latest-message-source-debug');
  if (netEl) netEl.textContent = label;
  if (bodyEl) bodyEl.textContent = messageBody;
  const src = (summarizedSourceText || '').trim();
  const srcUrl = (sourceUrl || '').trim();
  const dbg = (sourceDebugText || '').trim();
  const showSource = !!(src || srcUrl || dbg);
  // Collapsed by default on every (re-)render, including after a refresh — the user opts into
  // seeing the raw source text/debug info rather than it always taking up space in the card.
  if (sourceDetailsEl) sourceDetailsEl.classList.add('hidden');
  if (sourceToggleEl) {
    sourceToggleEl.textContent = 'Details';
    sourceToggleEl.setAttribute('aria-expanded', 'false');
  }
  if (sourceBlock && sourceTextEl) {
    if (showSource) {
      sourceTextEl.textContent = src;
      sourceBlock.classList.remove('hidden');
      if (sourceDebugEl) {
        if (dbg) {
          sourceDebugEl.textContent = dbg;
          sourceDebugEl.classList.remove('hidden');
        } else {
          sourceDebugEl.textContent = '';
          sourceDebugEl.classList.add('hidden');
        }
      }
      if (sourceUrlEl) {
        if (srcUrl) {
          sourceUrlEl.href = srcUrl;
          sourceUrlEl.textContent = `Fetched from: ${srcUrl}`;
          sourceUrlEl.classList.remove('hidden');
        } else {
          sourceUrlEl.href = '#';
          sourceUrlEl.textContent = '';
          sourceUrlEl.classList.add('hidden');
        }
      }
    } else {
      sourceTextEl.textContent = '';
      sourceBlock.classList.add('hidden');
      if (sourceDebugEl) {
        sourceDebugEl.textContent = '';
        sourceDebugEl.classList.add('hidden');
      }
      if (sourceUrlEl) {
        sourceUrlEl.href = '#';
        sourceUrlEl.textContent = '';
        sourceUrlEl.classList.add('hidden');
      }
    }
  }
  cardEl.dataset.platform = platformKey;
}

/**
 * The networks that show a "latest message" card, in display order. Per-network differences live here:
 * `countLabel` (how the multi-message count is worded; omit `showMeta` for Gmail, which shows only the summary),
 * `extraRequest` (extra fields the service worker needs), and LinkedIn's diagnostic text when nothing is found.
 */
const LATEST_MESSAGE_SOURCES = [
  { platform: 'gmail', label: 'Gmail', elId: 'latestGmailMessage', showMeta: false },
  {
    platform: 'linkedin',
    label: 'LinkedIn',
    elId: 'latestLinkedInMessage',
    showMeta: true,
    countLabel: 'messages summarized',
    logTiming: true,
    diagnoseEmpty: true,
    extraRequest: (c) => ({ displayName: c.displayName, linkedinProfileUrl: c.platforms?.linkedin?.profileUrl }),
  },
  { platform: 'facebook', label: 'Facebook', elId: 'latestFacebookMessage', showMeta: true, countLabel: 'messages summarized', logTiming: true },
  { platform: 'whatsapp', label: 'WhatsApp', elId: 'latestWhatsAppMessage', showMeta: true, countLabel: 'messages' },
];

/** Clear a latest-message card back to its hidden, empty state. */
function resetLatestMessageCard(el) {
  el.classList.add('hidden');
  const bodyEl = el.querySelector('.latest-message-body');
  if (bodyEl) bodyEl.textContent = '';
  el.querySelector('.latest-message-source-block')?.classList.add('hidden');
  const sourceTextEl = el.querySelector('.latest-message-source-text');
  if (sourceTextEl) sourceTextEl.textContent = '';
  const sourceUrlEl = el.querySelector('.latest-message-source-url');
  if (sourceUrlEl) {
    sourceUrlEl.href = '#';
    sourceUrlEl.textContent = '';
    sourceUrlEl.classList.add('hidden');
  }
  const sourceDebugEl = el.querySelector('.latest-message-source-debug');
  if (sourceDebugEl) {
    sourceDebugEl.textContent = '';
    sourceDebugEl.classList.add('hidden');
  }
}

/** Ask the service worker for one network's latest message and render it into that network's card. */
async function loadLatestMessageFor(contact, source, el, forceRefresh) {
  const { platform, label } = source;
  setLatestMessageCard(el, platform, 'Loading…');
  el.classList.remove('hidden');
  try {
    const request = {
      action: 'FETCH_LATEST_MESSAGE',
      platform,
      contactId: contact.id,
      ...(source.extraRequest ? source.extraRequest(contact) : {}),
      forceRefresh,
    };
    console.log(`[PRM contacts] Sending FETCH_LATEST_MESSAGE for ${label}:`, request);
    const res = await chrome.runtime.sendMessage(request);
    console.log(`[PRM contacts] FETCH_LATEST_MESSAGE (${label}) response:`, res);
    if (source.logTiming && !res?.error) {
      console.log(`[PRM contacts] latest-msg timing [${platform}]`, {
        lastExchangeAtMs: res.lastExchangeAtMs,
        lastExchangeAtIso: msToIsoLog(res.lastExchangeAtMs),
      });
    }
    if (res?.error) {
      setLatestMessageCard(el, platform, res.error);
    } else if (res?.lastMessage?.text) {
      let text = (res.summary || res.lastMessage.text || '').trim();
      if (source.showMeta) {
        const when =
          typeof res.lastMessage.deliveredAt === 'number'
            ? new Date(res.lastMessage.deliveredAt).toLocaleString()
            : res.lastMessage.deliveredAt || '';
        const parts = [];
        if (Array.isArray(res.recentMessages) && res.recentMessages.length > 1) {
          parts.push(`${res.recentMessages.length} ${source.countLabel}`);
        }
        if (res.lastMessage.fromName) parts.push(`From ${res.lastMessage.fromName}`);
        if (when) parts.push(when);
        if (parts.length) text += ` (${parts.join(' • ')})`;
      }
      const combined = formatRecentMessagesForSummary(res.recentMessages || []);
      const sourceBlock = combined.trim() ? combined : '';
      const fetchedFromUrl = String(res.fetchedFromUrl || '').trim();
      const dbg = res?.sourceDebug ? JSON.stringify(res.sourceDebug, null, 2) : '';
      setLatestMessageCard(el, platform, text, sourceBlock, fetchedFromUrl, dbg);
    } else if (source.diagnoseEmpty) {
      const url = String(res?.fetchedFromUrl || '').trim();
      const apiDiag = String(res?.apiDiag || '').trim();
      const resKeys = res ? Object.keys(res).join(',') : 'res=undefined';
      const diagText = `[diag: ${resKeys} | url=${url || '(none)'} | ${apiDiag || '(no apiDiag)'}]`;
      setLatestMessageCard(el, platform, `No recent ${label} messages found. ${diagText}`, '', url, apiDiag);
    } else {
      setLatestMessageCard(el, platform, `No recent ${label} messages found.`);
    }
  } catch (e) {
    setLatestMessageCard(el, platform, e?.message || `Failed to load latest ${label} message.`);
  }
}

async function loadLatestMessages(contact, { forceRefresh = false } = {}) {
  const section = document.getElementById('latestMessagesSection');
  const refreshBtn = document.getElementById('refreshLatestMessagesBtn');
  const cards = LATEST_MESSAGE_SOURCES.map((source) => ({ source, el: document.getElementById(source.elId) }));
  if (!section || cards.some((c) => !c.el)) return;
  console.log('[PRM contacts] loadLatestMessages for contact:', contact.id, contact.displayName, contact.platforms, { forceRefresh });
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing…';
  }
  for (const { el } of cards) resetLatestMessageCard(el);

  // Show the section (with per-platform "Loading…" cards) immediately, rather than only
  // after every platform has finished fetching — otherwise nothing is visible until the
  // whole sequence completes and results just pop in with no progress indication.
  section.classList.toggle('hidden', !LATEST_MESSAGE_SOURCES.some((s) => contact.platforms?.[s.platform]));

  for (const { source, el } of cards) {
    if (contact.platforms?.[source.platform]) await loadLatestMessageFor(contact, source, el, forceRefresh);
  }

  if (refreshBtn) {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh now';
  }
}

function renderFactoidsForContact(contact) {
  const effectiveIds = getEffectiveContactIds(contact);
  const list = [];
  for (const cid of effectiveIds) {
    for (const f of factoidsByContactId[cid] || []) {
      list.push({ ...f, _contactId: cid });
    }
  }
  const container = document.getElementById('detailFactoids');
  if (list.length === 0) {
    container.innerHTML = '<span class="factoid factoid-empty">No factoids</span>';
  } else {
    const byKey = new Map();
    for (const f of list) {
      const norm = factoidKeyNorm(f.key);
      const displayKey = isNotesKey(f.key) ? NOTES_KEY_CANONICAL : f.key;
      if (!byKey.has(norm)) {
        byKey.set(norm, { key: displayKey, values: [], items: [] });
      }
      const entry = byKey.get(norm);
      entry.values.push(f.value);
      entry.items.push({ id: f.id, contactId: f._contactId });
    }
    const grouped = Array.from(byKey.values()).map((e) => {
      const seen = new Set();
      const uniqueValues = e.values.filter((v) => {
        if (seen.has(v)) return false;
        seen.add(v);
        return true;
      });
      return {
        key: e.key,
        value: uniqueValues.join(FACTOID_VALUE_SEP),
        items: e.items,
      };
    });
    const groupAttr = (g) => {
      const raw = JSON.stringify(g.items);
      return raw.replace(/'/g, '&#39;');
    };
    container.innerHTML = grouped
      .map(
        (g) =>
          `<span class="factoid" data-group='${groupAttr(g)}'>
            <span class="key">${escapeHtml(g.key)}:</span>${escapeHtml(g.value)}
            <button type="button" class="factoid-delete" title="Remove factoid" aria-label="Remove">×</button>
          </span>`
      )
      .join('');
    container.querySelectorAll('.factoid-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const span = e.target.closest('.factoid');
        const groupJson = span?.dataset?.group;
        if (!groupJson) return;
        let items;
        try {
          items = JSON.parse(groupJson);
        } catch (_) {
          return;
        }
        for (const { id, contactId } of items) {
          await removeFactoid(contactId, id);
        }
      });
    });
  }
  document.getElementById('factoidKey').value = '';
  document.getElementById('factoidValue').value = '';
  document.getElementById('factoidSource').value = '';
}

async function addFactoid(contactId, key, value, source) {
  const keyTrim = (key || '').trim();
  const valueTrim = (value || '').trim();
  if (!keyTrim || !valueTrim) return;
  const existing = factoidsByContactId[contactId] || [];
  const src = (source || 'manual').trim() || undefined;
  let updated;
  if (isNotesKey(keyTrim)) {
    const notesIdx = existing.findIndex((f) => isNotesKey(f.key));
    if (notesIdx >= 0) {
      const combined = existing[notesIdx].value ? existing[notesIdx].value + NOTES_SEPARATOR + valueTrim : valueTrim;
      updated = existing.map((f, i) => (i === notesIdx ? { ...f, key: NOTES_KEY_CANONICAL, value: combined } : f));
    } else {
      updated = [...existing, { key: NOTES_KEY_CANONICAL, value: valueTrim, source: src }];
    }
  } else {
    updated = [...existing, { key: keyTrim, value: valueTrim, source: src }];
  }
  await storage.saveFactoidsForContact(contactId, updated);
  factoidsByContactId[contactId] = await storage.getFactoidsByContactId(contactId);
  const contact = contacts.find((c) => c.id === selectedId);
  if (contact) renderFactoidsForContact(contact);
  renderContactList(sortContacts(filterContacts()));
}

const FACTOID_VALUE_SEP = ' • '; // between same-key factoids from merged contacts

/** @param {boolean} [additive] - combine with an existing value instead of replacing it (see looksAdditive) */
async function addFactoidsFromParsed(contactId, parsed, additive = false) {
  if (!parsed?.length) return 0;
  const existing = factoidsByContactId[contactId] || [];
  const { merged, addedCount, updatedCount } = mergeParsedFactoids(existing, parsed, 'llm', additive);
  if (addedCount === 0 && updatedCount === 0) return 0;
  await storage.saveFactoidsForContact(contactId, merged);
  factoidsByContactId[contactId] = await storage.getFactoidsByContactId(contactId);
  const contact = contacts.find((c) => c.id === selectedId);
  if (contact) renderFactoidsForContact(contact);
  renderContactList(sortContacts(filterContacts()));
  return addedCount + updatedCount;
}

async function removeFactoid(contactId, factoidId) {
  const existing = factoidsByContactId[contactId] || [];
  const updated = existing.filter((f) => f.id !== factoidId);
  await storage.saveFactoidsForContact(contactId, updated);
  factoidsByContactId[contactId] = await storage.getFactoidsByContactId(contactId);
  const contact = contacts.find((c) => c.id === selectedId);
  if (contact) renderFactoidsForContact(contact);
  renderContactList(sortContacts(filterContacts()));
}

function renderMergeAndUndo(contact) {
  const mergeBtn = document.getElementById('mergeContactBtn');
  const mergeSearchWrap = document.getElementById('mergeSearchWrap');
  if (!contact) {
    mergeBtn?.classList.add('hidden');
    return;
  }
  mergeBtn?.classList.remove('hidden');
  mergeSearchWrap?.classList.add('hidden');
}

async function handleUndoMerge(contact, platformKey) {
  const blob = contact.platforms?.[platformKey];
  if (!blob?.id) return;
  const gmailEmail = platformKey === 'gmail' ? String(blob.email || '').trim() : '';
  const restored = {
    id: blob.id,
    displayName: blob.name || contact.displayName || 'Unknown',
    primaryEmail: gmailEmail || undefined,
    platforms: { [platformKey]: { ...blob } },
    lastInteraction: contact.lastInteraction || new Date().toISOString(),
    addedAt: contact.addedAt || new Date().toISOString(),
  };
  const updated = { ...contact, platforms: { ...contact.platforms } };
  delete updated.platforms[platformKey];
  try {
    await storage.saveContact(restored);
    await storage.saveContact(updated);
  } catch (e) {
    console.error('[PRM contacts] Undo merge failed:', e);
    return;
  }
  const idx = contacts.findIndex((c) => c.id === contact.id);
  if (idx >= 0) contacts[idx] = updated;
  const removedIdx = contacts.findIndex((c) => c.id === restored.id);
  if (removedIdx >= 0) contacts[removedIdx] = restored;
  else contacts.push(restored);
  factoidsByContactId[restored.id] = await storage.getFactoidsByContactId(restored.id);
  selectContact(contact.id);
  renderContactList(sortContacts(filterContacts()));
}

function openMergeSearch() {
  const wrap = document.getElementById('mergeSearchWrap');
  const input = document.getElementById('mergeSearchInput');
  wrap?.classList.remove('hidden');
  input?.focus();
  input?.select();
  runMergeSearch();
}

/** @param {string} name */
function mergeNameTokens(name) {
  return (name || '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter((w) => w.length >= 2);
}

/** How many name-tokens `otherName` shares with `referenceName` — used to surface likely duplicates first. */
function mergeNameMatchScore(referenceName, otherName) {
  const referenceTokens = new Set(mergeNameTokens(referenceName));
  if (referenceTokens.size === 0) return 0;
  return mergeNameTokens(otherName).filter((t) => referenceTokens.has(t)).length;
}

function runMergeSearch() {
  const contact = contacts.find((c) => c.id === selectedId);
  if (!contact) return;
  const q = (document.getElementById('mergeSearchInput')?.value || '').toLowerCase().trim();
  const list = contacts.filter(
    (c) =>
      c.id !== contact.id &&
      (c.platforms?.linkedin || c.platforms?.facebook || c.platforms?.whatsapp || c.platforms?.gmail),
  );
  const queryFiltered = q ? list.filter((c) => (c.displayName || '').toLowerCase().includes(q)) : list;
  // Merging is almost always "find the duplicate of the contact I have open", so surface contacts
  // whose name overlaps with it first — otherwise likely matches are buried in storage order.
  const sorted = queryFiltered
    .map((c) => ({ c, score: mergeNameMatchScore(contact.displayName, c.displayName) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
  const filtered = q ? sorted : sorted.slice(0, 20);
  const ul = document.getElementById('mergeSearchResults');
  if (!ul) return;
  ul.innerHTML = filtered
    .map((c) => {
      const tags = [];
      if (c.platforms?.linkedin) tags.push('LinkedIn');
      if (c.platforms?.facebook) tags.push('Facebook');
      if (c.platforms?.whatsapp) tags.push('WhatsApp');
      if (c.platforms?.gmail) tags.push('Gmail');
      const tagStr = tags.length ? ` (${tags.join(', ')})` : '';
      return `<li class="merge-result-item" data-id="${escapeHtml(c.id)}">${escapeHtml(c.displayName || 'Unknown')}${escapeHtml(tagStr)}</li>`;
    })
    .join('');
  ul.querySelectorAll('.merge-result-item').forEach((el) => {
    el.addEventListener('click', () => confirmAndMerge(contact.id, el.dataset.id));
  });
}

function confirmAndMerge(keepId, mergeId) {
  const keep = contacts.find((c) => c.id === keepId);
  const merge = contacts.find((c) => c.id === mergeId);
  if (!keep || !merge) return;
  if (!confirm(`Merge "${merge.displayName || 'Unknown'}" into "${keep.displayName || 'Unknown'}"? The other contact row will be removed; factoids and conversations stay in place.`)) return;
  closeMergeSearch();
  document.getElementById('mergeSearchInput').value = '';
  doMerge(keepId, mergeId);
}

async function doMerge(keepId, mergeId) {
  try {
    await storage.mergeContactInto(keepId, mergeId);
  } catch (e) {
    console.error('[PRM contacts] Merge failed:', e);
    alert(e?.message || 'Merge failed');
    return;
  }
  const updated = await storage.getContact(keepId);
  const idx = contacts.findIndex((c) => c.id === keepId);
  if (idx >= 0) contacts[idx] = updated;
  contacts = contacts.filter((c) => c.id !== mergeId);
  selectContact(keepId);
  renderContactList(sortContacts(filterContacts()));
}

/**
 * Reload contacts from IndexedDB and refresh list + network counts (e.g. during incremental LinkedIn sync).
 */
async function refreshContactsListFromDb() {
  try {
    contacts = await storage.getAllContacts();
    updateNetworkCounts();
    renderContactList(sortContacts(filterContacts()));
  } catch (e) {
    console.error('[PRM contacts] refreshContactsListFromDb failed:', e);
  }
}

async function init() {
  const savedListFilters = readListFilters();
  const idParam = getQueryParam('id');
  const qParam = getQueryParam('q');
  if (qParam) searchInput.value = qParam;
  else if (typeof savedListFilters?.search === 'string') searchInput.value = savedListFilters.search;

  console.log('[PRM contacts] Loading contacts and factoids from IndexedDB');
  try {
    const [loadedContacts, allFactoids] = await Promise.all([
      storage.getAllContacts(),
      storage.getAllFactoids(),
    ]);
    contacts = loadedContacts;
    factoidsByContactId = {};
    for (const f of allFactoids) {
      if (!factoidsByContactId[f.contactId]) factoidsByContactId[f.contactId] = [];
      factoidsByContactId[f.contactId].push(f);
    }
    console.log('[PRM contacts] Loaded', contacts.length, 'contacts,', allFactoids.length, 'factoids');
  } catch (e) {
    console.error('[PRM contacts] load failed:', e);
    contacts = [];
    factoidsByContactId = {};
  }
  updateNetworkCounts();
  if (savedListFilters) {
    if (typeof savedListFilters.linkedin === 'boolean') filterLinkedIn.checked = savedListFilters.linkedin;
    if (typeof savedListFilters.facebook === 'boolean') filterFacebook.checked = savedListFilters.facebook;
    if (typeof savedListFilters.whatsapp === 'boolean') filterWhatsApp.checked = savedListFilters.whatsapp;
    if (typeof savedListFilters.gmail === 'boolean') filterGmail.checked = savedListFilters.gmail;
  }
  try {
    const filterOpen = localStorage.getItem(FILTER_OPEN_KEY);
    if (filterOpen === 'true') {
      filterContent.hidden = false;
      filterToggle.setAttribute('aria-expanded', 'true');
      filterToggle.querySelector('.filter-toggle-icon').textContent = '−';
    }
    const savedSort = localStorage.getItem(SORT_ORDER_KEY);
    if (savedSort && ['alphabetical', 'newest', 'last-accessed', 'most-accessed', 'common-connections'].includes(savedSort)) {
      sortOrderSelect.value = savedSort === 'newest' ? 'last-accessed' : savedSort;
    }
  } catch (_) {}
  const sortedFiltered = sortContacts(filterContacts());
  if (idParam) selectContact(idParam);
  else if (sortedFiltered.length > 0) {
    selectContact(sortedFiltered[0].id);
  }
  renderContactList(sortedFiltered);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.prmContactsSyncStamp) return;
  refreshContactsListFromDb();
});

function setFilterPanelOpen(open) {
  filterContent.hidden = !open;
  filterToggle.setAttribute('aria-expanded', String(open));
  filterToggle.querySelector('.filter-toggle-icon').textContent = open ? '−' : '+';
  try {
    localStorage.setItem(FILTER_OPEN_KEY, String(open));
  } catch (_) {}
}

filterToggle.addEventListener('click', () => {
  const isOpen = !filterContent.hidden;
  setFilterPanelOpen(!isOpen);
});

filterContent.hidden = true;

sortOrderSelect.addEventListener('change', () => {
  try {
    localStorage.setItem(SORT_ORDER_KEY, sortOrderSelect.value);
  } catch (_) {}
  renderContactList(sortContacts(filterContacts()));
});

searchInput.addEventListener('input', () => {
  persistListFilters();
  renderContactList(sortContacts(filterContacts()));
});
filterLinkedIn.addEventListener('change', () => {
  persistListFilters();
  renderContactList(sortContacts(filterContacts()));
});
filterFacebook.addEventListener('change', () => {
  persistListFilters();
  renderContactList(sortContacts(filterContacts()));
});
filterWhatsApp.addEventListener('change', () => {
  persistListFilters();
  renderContactList(sortContacts(filterContacts()));
});
filterGmail.addEventListener('change', () => {
  persistListFilters();
  renderContactList(sortContacts(filterContacts()));
});

document.getElementById('refreshLatestMessagesBtn')?.addEventListener('click', () => {
  const contact = contacts.find((c) => c.id === selectedId);
  if (contact) loadLatestMessages(contact, { forceRefresh: true });
});

document.querySelectorAll('.latest-message-source-toggle').forEach((toggleBtn) => {
  toggleBtn.addEventListener('click', () => {
    const details = toggleBtn.closest('.latest-message-source-block')?.querySelector('.latest-message-source-details');
    if (!details) return;
    const expanded = !details.classList.contains('hidden');
    details.classList.toggle('hidden', expanded);
    toggleBtn.textContent = expanded ? 'Details' : 'Hide details';
    toggleBtn.setAttribute('aria-expanded', String(!expanded));
  });
});

function closeMergeSearch() {
  document.getElementById('mergeSearchWrap')?.classList.add('hidden');
}

document.getElementById('mergeContactBtn')?.addEventListener('click', () => {
  const wrap = document.getElementById('mergeSearchWrap');
  if (wrap && !wrap.classList.contains('hidden')) {
    closeMergeSearch();
  } else {
    openMergeSearch();
  }
});
document.getElementById('mergeSearchInput')?.addEventListener('input', () => runMergeSearch());
document.getElementById('mergeSearchInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMergeSearch();
});
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('mergeSearchWrap');
  const btn = document.getElementById('mergeContactBtn');
  if (!wrap || wrap.classList.contains('hidden')) return;
  if (wrap.contains(e.target) || btn?.contains(e.target)) return;
  closeMergeSearch();
});

document.getElementById('factoidAddBtn').addEventListener('click', async () => {
  if (!selectedId) return;
  const key = document.getElementById('factoidKey').value;
  const value = document.getElementById('factoidValue').value;
  const source = document.getElementById('factoidSource').value;
  await addFactoid(selectedId, key, value, source);
});

const factoidNaturalLanguageInput = document.getElementById('factoidNaturalLanguage');
const factoidParseBtn = document.getElementById('factoidParseBtn');

factoidNaturalLanguageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    factoidParseBtn.click();
  }
});

const factoidAiSection = document.getElementById('factoidAiSection');
const factoidManualSection = document.getElementById('factoidManualSection');
const factoidModeToggle = document.getElementById('factoidModeToggle');

factoidModeToggle.addEventListener('click', (e) => {
  e.preventDefault();
  const goingToManual = factoidManualSection.classList.contains('hidden');
  factoidManualSection.classList.toggle('hidden', !goingToManual);
  factoidAiSection.classList.toggle('hidden', goingToManual);
  factoidModeToggle.textContent = goingToManual ? 'Add with AI' : 'Add manually';
});

factoidParseBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  const input = document.getElementById('factoidNaturalLanguage');
  const statusEl = document.getElementById('factoidParseStatus');
  const btn = document.getElementById('factoidParseBtn');
  const text = (input.value || '').trim();
  if (!text) {
    statusEl.textContent = 'Enter a description first.';
    return;
  }
  btn.disabled = true;
  statusEl.textContent = 'Parsing with LLM…';
  statusEl.classList.remove('error');
  try {
    const res = await chrome.runtime.sendMessage({ action: 'PARSE_FACTOIDS', text });
    if (res?.error) {
      statusEl.textContent = res.error;
      statusEl.classList.add('error');
    } else if (res?.factoids?.length) {
      const n = await addFactoidsFromParsed(selectedId, res.factoids, looksAdditive(text));
      input.value = '';
      statusEl.textContent = `Added ${n} factoid${n === 1 ? '' : 's'}.`;
    } else {
      statusEl.textContent = 'No factoids extracted. Try a clearer description.';
    }
  } catch (e) {
    statusEl.textContent = e?.message || 'Request failed';
    statusEl.classList.add('error');
  }
  btn.disabled = false;
});

init();
initModelDownloadBanner();
void initWebLLMModelSelect(document.getElementById('factoidModelSelect'));
