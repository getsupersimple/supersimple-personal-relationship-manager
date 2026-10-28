/**
 * WhatsApp Web in-memory store scrape via background tab.
 *
 * Injects into WhatsApp Web's MAIN world and reads messages directly from the
 * Webpack module registry. No DOM scraping or scrolling needed.
 *
 * Falls back to DOM scraping if the store cannot be accessed.
 */

import { sleep, withBackgroundTab } from './tab-scraper-utils.js';

const STABILIZE_MS = 6000;

const WA_STORE_INJECTED = async (wantName, maxMsgs, mode) => {
  try {
    // ── 1. Find webpack __webpack_require__ via chunk push ───────────────────
    // window.webpackChunkwhatsapp_web_client is the known WA Web chunk array.
    let wpRequire;
    const chunkKeys = Object.keys(window).filter(
      (k) => Array.isArray(window[k]) && k.includes('webpack')
    );
    for (const key of chunkKeys) {
      try {
        window[key].push([[Math.random()], {}, (r) => { wpRequire = r; }]);
      } catch (_) {}
      if (wpRequire) break;
    }
    if (!wpRequire && typeof window.__webpack_require__ === 'function') {
      wpRequire = window.__webpack_require__;
    }

    // ── 2. Also try WA Web's AMD require with known module names ─────────────
    let chatModels = null;
    const msgStoreCandidates = [];
    const triedWaNames = {};

    if (typeof window.require === 'function') {
      const chatNames = [
        'WAWebChatStore', 'WAWebChatCollection', 'ChatStore',
        'WAWebWidgetDataStore', 'ChatCollection', 'WAWebContactsAddonStore',
      ];
      const msgNames = [
        'WAWebMsgStore', 'WAWebMsgCollection', 'MsgStore',
        'WAWebMessageStore', 'MessageStore',
      ];
      const describeVal = (val) => {
        if (val === null) return 'null';
        const t = typeof val;
        if (t !== 'object' && t !== 'function') return t;
        try {
          const keys = Object.keys(val).slice(0, 8);
          const proto = Object.getPrototypeOf(val)?.constructor?.name || '';
          const size = val.size ?? val.length ?? '?';
          let sampleKeys = [];
          try {
            let s;
            if (typeof val.find === 'function') s = val.find(() => true);
            else if (typeof val.forEach === 'function') { val.forEach((v) => { if (!s) s = v; }); }
            if (s) sampleKeys = Object.keys(s).slice(0, 8);
          } catch (_) {}
          return { t, proto, size, keys, sampleKeys };
        } catch (_) { return t; }
      };

      for (const name of chatNames) {
        try {
          const m = window.require(name);
          if (!m) { triedWaNames[name] = null; continue; }
          const mKeys = Object.keys(m).slice(0, 8);
          const exportDescriptions = {};
          for (const key of mKeys) {
            exportDescriptions[key] = describeVal(m[key]);
          }
          triedWaNames[name] = exportDescriptions;

          if (!chatModels) {
            // Check the module itself
            if (typeof m.find === 'function' || typeof m.forEach === 'function') {
              try {
                let sample;
                if (typeof m.find === 'function') sample = m.find(() => true);
                else { m.forEach((v) => { if (!sample) sample = v; }); }
                if (sample && (sample.id || sample.name !== undefined)) { chatModels = m; }
              } catch (_) {}
            }
            // Check each named export
            if (!chatModels) {
              for (const key of mKeys) {
                const val = m[key];
                if (!val || typeof val !== 'object') continue;
                try {
                  // Try standard iteration
                  let sample;
                  if (typeof val.find === 'function') sample = val.find(() => true);
                  else if (typeof val.forEach === 'function') { val.forEach((v) => { if (!sample) sample = v; }); }
                  if (sample && (sample.id || sample.name !== undefined)) { chatModels = val; break; }

                  // WA Web stores chats in _models (Backbone collection internals)
                  const models = val._models || val._index;
                  if (models && typeof models === 'object') {
                    const values = Object.values(models);
                    if (values.length > 0 && values[0] && (values[0].id || values[0].name !== undefined)) {
                      chatModels = val;
                      break;
                    }
                  }
                } catch (_) {}
              }
            }
          }
        } catch (_) { triedWaNames[name] = 'error'; }
      }
      for (const name of msgNames) {
        try {
          const m = window.require(name);
          if (m && (typeof m.getMessages === 'function' || typeof m.loadMessages === 'function')) {
            msgStoreCandidates.push(m);
          }
        } catch (_) {}
      }
    }

    // ── 3. Scan webpack modules if we have wpRequire ─────────────────────────
    const wpRequireAllKeys = wpRequire ? Object.getOwnPropertyNames(wpRequire).slice(0, 20) : [];
    const moduleMap = wpRequire ? (wpRequire.m || wpRequire.c || {}) : {};
    const moduleIds = Object.keys(moduleMap);
    const useCache = moduleIds.length > 0 && !wpRequire?.m;
    const wpRequireKeys = wpRequireAllKeys;

    for (const id of moduleIds) {
      let mod;
      try {
        mod = useCache ? wpRequire.c[id]?.exports : wpRequire(id);
      } catch (_) { continue; }
      if (!mod || typeof mod !== 'object') continue;

      if (!chatModels && typeof mod.find === 'function' && typeof mod.get === 'function') {
        try {
          const sample = mod.find(() => true);
          if (sample && (sample.name !== undefined || sample.formattedName !== undefined) && sample.id) {
            chatModels = mod;
          }
        } catch (_) {}
      }
      if (!chatModels && typeof mod.forEach === 'function' && typeof mod.size === 'number') {
        try {
          let sample;
          mod.forEach((v) => { if (!sample) sample = v; });
          if (sample && (sample.name !== undefined || sample.id)) chatModels = mod;
        } catch (_) {}
      }
      if (typeof mod.getMessages === 'function' || typeof mod.loadMessages === 'function') {
        msgStoreCandidates.push(mod);
      }
    }

    // ── 4. Try window.Store global (some WA Web versions) ───────────────────
    if (!chatModels && window.Store?.Chat) chatModels = window.Store.Chat;
    if (window.Store?.Msg) msgStoreCandidates.push(window.Store.Msg);

    if (!chatModels) {
      return {
        ok: false,
        error: 'chat store not found',
        chunkKeys,
        wpRequireKeys,
        moduleCount: moduleIds.length,
        triedWaNames,
        hasWindowStore: !!window.Store,
        windowStoreKeys: window.Store ? Object.keys(window.Store).slice(0, 20) : [],
      };
    }

    // Get all chat objects — support Backbone _models, _index, or standard iteration
    const getAllChats = (collection) => {
      if (!collection) return [];
      if (collection._models && typeof collection._models === 'object') {
        return Object.values(collection._models);
      }
      if (collection._index && typeof collection._index === 'object') {
        return Object.values(collection._index);
      }
      const arr = [];
      try { if (typeof collection.forEach === 'function') collection.forEach((c) => arr.push(c)); } catch (_) {}
      return arr;
    };

    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const chatName = (c) => norm(
      c.name || c.formattedName || c.displayName || c.verifiedName ||
      c.pushname || c.notifyName ||
      c.contact?.name || c.contact?.pushname || c.contact?.formattedName || ''
    );

    const allChats = getAllChats(chatModels);

    // ── List mode: return every 1:1 chat directly from the store. No DOM, no
    // scrolling, no virtualization limits — this is the entire in-memory collection.
    if (mode === 'list') {
      const isGroupChat = (c) => {
        const idSerialized = String(c.id?._serialized || c.id || '');
        return !!(
          c.isGroup ||
          c.kind === 'group' ||
          c.kind === 'broadcast' ||
          c.kind === 'newsletter' ||
          c.id?.server === 'g.us' ||
          c.id?.server === 'broadcast' ||
          idSerialized.endsWith('@g.us') ||
          c.groupMetadata
        );
      };
      const chats = allChats
        .filter((c) => !isGroupChat(c))
        .map((c) => {
          const name = chatName(c);
          if (!name) return null;
          const rawUser = String(c.id?.user || '').replace(/\D/g, '');
          const phoneE164 = rawUser.length >= 7 && rawUser.length <= 16 ? `+${rawUser}` : undefined;
          return { name, chatKey: `name:${name.toLowerCase()}`, phoneE164 };
        })
        .filter(Boolean);
      return { ok: true, chats, totalChats: allChats.length };
    }

    // ── 5. Find the target chat ──────────────────────────────────────────────
    const want = norm(wantName);
    const wantWords = want.split(/\s+/);
    let targetChat = null;
    // Pass 1: exact match
    for (const chat of allChats) {
      if (chatName(chat) === want) { targetChat = chat; break; }
    }
    // Pass 2: all words of query appear in name
    if (!targetChat) {
      for (const chat of allChats) {
        const n = chatName(chat);
        if (wantWords.every((w) => n.includes(w))) { targetChat = chat; break; }
      }
    }
    // Pass 3: name contains query as substring
    if (!targetChat) {
      for (const chat of allChats) {
        const n = chatName(chat);
        if (n.includes(want)) { targetChat = chat; break; }
      }
    }

    if (!targetChat) {
      // Show first 10 non-empty chat names with all name fields for diagnosis
      const samples = allChats.slice(0, 30).map((c) => ({
        name: c.name,
        formattedName: c.formattedName,
        pushname: c.pushname,
        displayName: c.displayName,
        verifiedName: c.verifiedName,
        notifyName: c.notifyName,
        contact: c.contact ? { name: c.contact.name, pushname: c.contact.pushname, formattedName: c.contact.formattedName } : undefined,
      })).filter((s) => Object.values(s).some((v) => v && typeof v === 'string' && v.trim())).slice(0, 10);
      return { ok: false, error: `chat "${want}" not found`, samples, totalChats: allChats.length };
    }

    // ── 6. Extract messages ──────────────────────────────────────────────────
    const chatId = targetChat.id?._serialized || String(targetChat.id || '');

    const extractMsgs = (collection) => {
      if (!collection) return [];
      const arr = collection.models
        || (typeof collection[Symbol.iterator] === 'function' ? Array.from(collection) : []);
      return arr
        .map((m) => ({
          text: String(m.body || m.text || m.caption || '').trim(),
          fromMe: !!m.fromMe,
          timestamp: m.t || m.timestamp || null,
        }))
        .filter((m) => m.text);
    };

    let msgs = [];

    // Diagnostic: inspect chat object structure
    const chatKeys = Object.keys(targetChat).slice(0, 20);
    const ownColl = targetChat.msgs || targetChat.messages;
    const ownCollInfo = ownColl ? {
      keys: Object.keys(ownColl).slice(0, 10),
      size: ownColl.size ?? ownColl.length,
      modelCount: ownColl._models ? Object.keys(ownColl._models).length : '?',
    } : null;

    if (ownColl) {
      // Try to load more messages before reading
      try { await ownColl.loadEarlier?.(); } catch (_) {}
      try { await ownColl.loadMore?.(); } catch (_) {}
      try { await ownColl.load?.(); } catch (_) {}
      // Try _models (Backbone internals) — always present even when iteration API differs
      if (ownColl._models) {
        msgs = Object.values(ownColl._models)
          .map((m) => ({
            text: String(m.body || m.text || m.caption || '').trim(),
            fromMe: !!m.fromMe,
            timestamp: m.t || m.timestamp || null,
          }))
          .filter((m) => m.text);
      }
      if (msgs.length === 0) msgs = extractMsgs(ownColl);
    }

    // Strategy A: waitForChatLoading() then getAllMsgs() / _models
    if (msgs.length <= 1) {
      try {
        await targetChat.waitForChatLoading?.();
        const all = await targetChat.getAllMsgs?.();
        if (all) {
          const candidate = extractMsgs(all);
          if (candidate.length > msgs.length) msgs = candidate;
        }
      } catch (_) {}
      if (msgs.length <= 1 && ownColl?._models) {
        const refreshed = Object.values(ownColl._models)
          .map((m) => ({ text: String(m.body || m.text || m.caption || '').trim(), fromMe: !!m.fromMe, timestamp: m.t || m.timestamp || null }))
          .filter((m) => m.text);
        if (refreshed.length > msgs.length) msgs = refreshed;
      }
    }

    // Strategy A2: __x_msgChunks — array of chunk collections
    if (msgs.length <= 1) {
      try {
        const chunks = targetChat.__x_msgChunks;
        if (Array.isArray(chunks)) {
          for (const chunk of chunks) {
            const candidate = [
              ...extractMsgs(chunk),
              ...(chunk._models ? Object.values(chunk._models).map((m) => ({
                text: String(m.body || m.text || '').trim(), fromMe: !!m.fromMe, timestamp: m.t || m.timestamp || null,
              })).filter((m) => m.text) : []),
            ];
            if (candidate.length > msgs.length) msgs = candidate;
          }
        }
      } catch (_) {}
    }

    // Strategy A3: query wawc IndexedDB for messages
    if (msgs.length <= 1) {
      try {
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('wawc');
          r.onsuccess = (e) => res(e.target.result);
          r.onerror = () => rej(r.error);
        });
        const storeNames = Array.from(db.objectStoreNames);
        const msgStoreName = storeNames.find((s) => /msg/i.test(s));
        if (msgStoreName) {
          const tx = db.transaction([msgStoreName], 'readonly');
          const idbStore = tx.objectStore(msgStoreName);
          const idxNames = Array.from(idbStore.indexNames);
          const idxName = idxNames.find((i) => /chat|remote|jid/i.test(i));
          const idbMsgs = await new Promise((res) => {
            const req = idxName
              ? idbStore.index(idxName).getAll(IDBKeyRange.only(chatId), 20)
              : idbStore.getAll(undefined, 100);
            req.onsuccess = () => res(req.result || []);
            req.onerror = () => res([]);
          });
          const idbExtracted = idbMsgs
            .map((m) => ({ text: String(m.body || m.text || m.caption || '').trim(), fromMe: !!m.fromMe, timestamp: m.t || m.timestamp || null }))
            .filter((m) => m.text);
          if (idbExtracted.length > msgs.length) msgs = idbExtracted;
        }
        // Log store names for diagnosis
        msgs._wawcStores = storeNames;
        db.close();
      } catch (e) { msgs._wawcErr = String(e?.message || e); }
    }

    // Strategy B: scan webpack chunk array for message store modules
    if (msgs.length <= 1 && wpRequire) {
      try {
        const chunkArr = window.webpackChunkwhatsapp_web_client || [];
        for (const entry of chunkArr) {
          if (msgs.length >= maxMsgs) break;
          if (!Array.isArray(entry) || !entry[1]) continue;
          for (const [id, factory] of Object.entries(entry[1])) {
            if (msgs.length >= maxMsgs) break;
            try {
              const src = String(factory);
              if (!/getMessages|loadMessages|msgStore|MsgStore/i.test(src)) continue;
              const mod = wpRequire(id);
              if (!mod || typeof mod !== 'object') continue;
              for (const val of [mod, ...Object.values(mod)]) {
                if (!val || typeof val !== 'object') continue;
                try {
                  const res = await (
                    val.getMessages?.(chatId, { count: maxMsgs }) ??
                    val.getMessages?.(chatId) ??
                    val.loadMessages?.(chatId, maxMsgs)
                  );
                  if (res) {
                    const candidate = extractMsgs(res);
                    if (candidate.length > msgs.length) msgs = candidate;
                  }
                } catch (_) {}
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    // Strategy B2: query IndexedDB directly
    if (msgs.length <= 1) {
      try {
        const dbList = (await indexedDB.databases?.()) || [];
        const idbDiag = { dbList: dbList.map((d) => d.name) };
        const waDbName = dbList.find((d) => d.name === 'wawc')?.name
          || dbList.find((d) => /wawc|whatsapp/i.test(d.name || ''))?.name;
        if (waDbName) {
          const db = await new Promise((res, rej) => {
            const r = indexedDB.open(waDbName);
            r.onsuccess = (e) => res(e.target.result);
            r.onerror = () => rej(r.error);
          });
          const storeNames = Array.from(db.objectStoreNames);
          idbDiag.storeNames = storeNames;
          const msgStoreName = storeNames.find((s) => /msg|message/i.test(s));
          if (msgStoreName) {
            const tx = db.transaction([msgStoreName], 'readonly');
            const idbStore = tx.objectStore(msgStoreName);
            const idxNames = Array.from(idbStore.indexNames);
            idbDiag.indexes = idxNames;
            const idxName = idxNames.find((i) => /chat|remote/i.test(i));
            const idbMsgs = await new Promise((res) => {
              const req = idxName
                ? idbStore.index(idxName).getAll(IDBKeyRange.only(chatId), maxMsgs * 3)
                : idbStore.getAll(undefined, 100);
              req.onsuccess = () => res(req.result || []);
              req.onerror = () => res([]);
            });
            const idbExtracted = idbMsgs
              .filter((m) => !idxName || [m.chatId, m.remote, m.to, m.from].includes(chatId))
              .map((m) => ({ text: String(m.body || m.text || m.caption || '').trim(), fromMe: !!m.fromMe, timestamp: m.t || m.timestamp || null }))
              .filter((m) => m.text);
            idbDiag.found = idbExtracted.length;
            if (idbExtracted.length > msgs.length) msgs = idbExtracted;
          }
          db.close();
        }
        if (msgs.length <= 1) msgs._idbDiag = idbDiag; // attach for logging
      } catch (_) {}
    }

    // Strategy C: scan AMD modules
    if (msgs.length <= 1) {
      let moduleNames = [];
      try {
        const ctx = window.require.s?.contexts?._?.defined;
        if (ctx) moduleNames = Object.keys(ctx).filter((k) => /msg|message/i.test(k));
      } catch (_) {}
      if (!moduleNames.length) {
        moduleNames = ['WAWebMsgStore', 'WAWebMsgCollection', 'WAWebChatMsgStore',
          'WAWebMessagesStore', 'MsgStore', 'WAWebMessageStore', 'WAWebMsgDB'];
      }
      for (const name of moduleNames) {
        if (msgs.length >= maxMsgs) break;
        try {
          const m = window.require(name);
          if (!m) continue;
          for (const store of [m, ...Object.values(m)]) {
            if (!store || typeof store !== 'object') continue;
            try {
              const res = await (
                store.getMessages?.(chatId, { count: maxMsgs }) ??
                store.getMessages?.(chatId) ??
                store.loadMessages?.(chatId, maxMsgs) ??
                store.fetchMessages?.(chatId, maxMsgs)
              );
              if (res) {
                const candidate = extractMsgs(res);
                if (candidate.length > msgs.length) msgs = candidate;
              }
            } catch (_) {}
          }
        } catch (_) {}
      }
    }

    // Diagnostics: enumerate AMD modules and IDB databases
    const diag = {};
    try {
      const ctx = window.require.s?.contexts?._?.defined;
      if (ctx) diag.amdModules = Object.keys(ctx).filter((k) => /msg|message|db|store/i.test(k)).slice(0, 30);
    } catch (_) {}
    try {
      diag.idbDatabases = ((await indexedDB.databases?.()) || []).map((d) => d.name);
    } catch (_) {}
    try {
      diag.chatKeys = Object.keys(targetChat).slice(0, 30);
      diag.chatMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(targetChat)).filter((k) => /msg|load|earlier/i.test(k));
      diag.ownCollKeys = ownColl ? Object.keys(ownColl).slice(0, 20) : null;
      diag.ownCollMethods = ownColl ? Object.getOwnPropertyNames(Object.getPrototypeOf(ownColl)).filter((k) => /msg|load|earlier/i.test(k)) : null;
    } catch (_) {}
    diag.wpRequireCallable = typeof wpRequire === 'function';
    diag.chunkArrayLen = (window.webpackChunkwhatsapp_web_client || []).length;
    diag.msgCount = msgs.length;

    msgs = msgs.slice(-maxMsgs);
    if (msgs.length === 0) {
      return {
        ok: false,
        error: 'chat found but no messages extracted',
        chatId,
        chatKeys,
        ownCollInfo,
        msgStoreCandidateCount: msgStoreCandidates.length,
      };
    }

    return { ok: true, msgs, chatId, msgCount: msgs.length, diag };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
};

/**
 * @param {string} chatDisplayName
 * @param {number} [limit]
 * @param {{ log?: (...a: unknown[]) => void }} [options]
 */
export async function scrapeWhatsAppMessagesViaStoreInBackgroundTab(chatDisplayName, limit = 5, options = {}) {
  const log = options.log || (() => {});
  const lim = Math.max(1, Math.min(Number(limit) || 5, 25));
  const name = String(chatDisplayName || '').trim();
  if (!name) return { error: 'Missing WhatsApp chat name.' };

  const targetUrl = 'https://web.whatsapp.com/';

  try {
    return await withBackgroundTab(targetUrl, async (tabId) => {
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

      log('whatsappStoreScrape: waiting', STABILIZE_MS, 'ms for stores to load');
      await sleep(STABILIZE_MS);

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: WA_STORE_INJECTED,
        args: [name, lim],
      });

      const r = results?.[0]?.result;
      log('whatsappStoreScrape: store result:', JSON.stringify(r));

      if (!r?.ok) {
        return { error: r?.error || 'WhatsApp store access failed.', storeDiag: r };
      }

      const messages = r.msgs.map((m) => ({
        text: m.text,
        fromName: m.fromMe ? 'Me' : 'Contact',
        deliveredAt: m.timestamp ? m.timestamp * 1000 : null,
      }));

      return { success: true, messages, fetchedFromUrl: targetUrl, mechanism: 'store' };
    }, { log, label: 'WhatsApp store' });
  } catch (e) {
    return { error: e?.message || String(e) || 'WhatsApp store scrape failed.' };
  }
}

/**
 * List every 1:1 WhatsApp chat directly from the in-memory store — no DOM scraping,
 * no scrolling, so it isn't limited by the chat list's virtualized rendering (which
 * only mounts a handful of rows at a time and won't reveal more via a background tab,
 * since the underlying re-render is itself gated on requestAnimationFrame/real paint).
 * @param {{ log?: (...a: unknown[]) => void }} [options]
 * @returns {Promise<{ success: true, chats: Array<{ name: string, chatKey: string, phoneE164?: string }> } | { error: string, storeDiag?: unknown }>}
 */
export async function scrapeWhatsAppChatListViaStoreInBackgroundTab(options = {}) {
  const log = options.log || (() => {});
  const targetUrl = 'https://web.whatsapp.com/';

  try {
    return await withBackgroundTab(targetUrl, async (tabId) => {
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

      log('whatsappStoreScrape: waiting', STABILIZE_MS, 'ms for stores to load');
      await sleep(STABILIZE_MS);

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: WA_STORE_INJECTED,
        args: ['', 0, 'list'],
      });

      const r = results?.[0]?.result;
      log('whatsappStoreScrape: chat list result: totalChats=', r?.totalChats, 'chats=', r?.chats?.length, r?.ok ? '' : JSON.stringify(r));

      if (!r?.ok) {
        return { error: r?.error || 'WhatsApp store access failed.', storeDiag: r };
      }

      return { success: true, chats: r.chats, mechanism: 'store' };
    }, { log, label: 'WhatsApp store list' });
  } catch (e) {
    return { error: e?.message || String(e) || 'WhatsApp chat list store scrape failed.' };
  }
}
