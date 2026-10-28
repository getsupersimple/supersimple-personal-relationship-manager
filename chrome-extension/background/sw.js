/**
 * Background service worker - orchestrates sync, WebLLM extraction
 * Polyfill: service workers have no window; Vite's modulepreload uses it
 */
if (typeof window === 'undefined') globalThis.window = globalThis;

import { storage } from '../lib/storage.js';
import { latestExchangeMsFromRecentMessages } from '../lib/message-time.js';
import { generateId } from '../shared/types.js';
import { processConnections, mergeLinkedInConnectionsBatch } from '../lib/linkedin-processor.js';
import { normalizeLinkedInProfileUrl } from '../lib/linkedin-url.js';
import { processFacebookConnections } from '../lib/facebook-processor.js';
import { processWhatsAppConnections } from '../lib/whatsapp-processor.js';
import { processGmailContacts } from '../lib/gmail-processor.js';
import {
  facebookInitTokensWithCredentials,
  facebookFetchFriendsPageWithCredentials,
  facebookTryFetchFriendsFromFriendsListPageSjs,
  getFacebookCookieHeaderForDocumentFetch,
  FACEBOOK_CURL_LIKE_GET_HEADERS,
} from '../lib/facebook-api.js';
import { resolveMessagingUrlFromProfileHtml } from '../lib/facebook-bulk-messaging-url.js';
import {
  scrapeFacebookMessengerThreadViaBackgroundTab,
  extractLatestFacebookMessageFromMessengerContainer,
  extractRecentFacebookMessagesFromMessengerContainer,
} from '../lib/facebook-messenger-tab-scrape.js';
import { extractFacebookThreadUpdatedAtMsFromHtml } from '../lib/facebook-thread-time.js';
import { scrapeWhatsAppConversationListViaBackgroundTab } from '../lib/whatsapp-tab-scrape.js';
import { scrapeWhatsAppThreadRecentMessagesViaBackgroundTab } from '../lib/whatsapp-thread-tab-scrape.js';
import { scrapeWhatsAppMessagesViaStoreInBackgroundTab, scrapeWhatsAppChatListViaStoreInBackgroundTab } from '../lib/whatsapp-store-scrape.js';
import {
  scrapeGoogleContactsPageViaBackgroundTab,
  GOOGLE_CONTACTS_SYNC_URLS,
} from '../lib/google-contacts-tab-scrape.js';
import { scrapeGmailLatestMessageByEmailViaBackgroundTab } from '../lib/gmail-message-tab-scrape.js';
import { formatRecentMessagesForSummary } from '../lib/format-recent-messages-for-summary.js';
import { DEFAULT_MODEL, LOCAL_LLM_MODEL_ID } from '../lib/model-ids.js';
import {
  migrateRemovedChatGptProvider,
  getSelectedModelId,
  purgeExpiredLatestMessageCache,
} from '../lib/provider-migration.js';
import { getPaginationDelayMs, collectCursorPages, pause } from '../lib/pagination-delay.js';
import { getEffectiveContactIds } from '../lib/contact-effective-ids.js';
import {
  resolveContactMention,
  resolveDisambiguationReply,
  describeContactForDisambiguation,
} from '../lib/contact-mention-resolver.js';
import { mergeParsedFactoids, looksAdditive } from '../lib/factoid-merge.js';

const VERSION = "1.85.0";
const LOG = (...args) => console.log('[PRM background]', ...args);

const OFFSCREEN_URL = 'offscreen/offscreen.html';
/** Recent messages to fetch and summarize together (LinkedIn, Facebook, future platforms). */
const RECENT_MESSAGES_FOR_SUMMARY = 5;
const WHATSAPP_WEB_URL = 'https://web.whatsapp.com/';

/** Ask AI name-disambiguation: how many same-name candidates to actually list/offer at once.
 * A shared first name can match far more contacts than this (a real reported case: 30 "Alex"es
 * on LinkedIn alone) — buildMoreCandidatesNote discloses how many were left out rather than
 * silently dropping them, which was confusing ("where are the missing ones?"). */
const SHOWN_CANDIDATE_LIMIT = 8;

/** @param {number} remainingCount */
function buildMoreCandidatesNote(remainingCount) {
  if (!remainingCount || remainingCount <= 0) return '';
  return `\n...and ${remainingCount} more. Try including their last name or where they work to narrow it down.`;
}

/** @param {string} contactId @param {string} platform */
function latestMessageCacheKey(contactId, platform) {
  return `msgCache_${contactId}_${platform}`;
}

/** @returns {Promise<number>} ms; 0 means caching disabled (always refresh) */
async function getConversationRefreshMs() {
  const { conversationRefreshMinutes } = await chrome.storage.local.get('conversationRefreshMinutes');
  const minutes = typeof conversationRefreshMinutes === 'number' && conversationRefreshMinutes > 0
    ? conversationRefreshMinutes
    : 0;
  return minutes * 60 * 1000;
}

/** @returns {Promise<number>} how many recent messages to fetch per contact; clamped 1-25, default RECENT_MESSAGES_FOR_SUMMARY */
async function getRecentMessagesLimit() {
  const { recentMessagesLimit } = await chrome.storage.local.get('recentMessagesLimit');
  const n = Number(recentMessagesLimit);
  if (!Number.isFinite(n) || n < 1) return RECENT_MESSAGES_FOR_SUMMARY;
  return Math.min(25, Math.round(n));
}

/**
 * Read whatever credentials/config a cloud/local LLM provider needs, based on the selected model id.
 * @param {string} modelId
 * @returns {Promise<{ localLlmBaseUrl?: string, localLlmModel?: string, localLlmApiKey?: string }>}
 */
async function getLlmProviderCredentials(modelId) {
  if (modelId === LOCAL_LLM_MODEL_ID) {
    const { localLlmBaseUrl, localLlmModel, localLlmApiKey } = await chrome.storage.local.get([
      'localLlmBaseUrl',
      'localLlmModel',
      'localLlmApiKey',
    ]);
    return {
      localLlmBaseUrl: (localLlmBaseUrl || '').trim(),
      localLlmModel: (localLlmModel || '').trim(),
      localLlmApiKey: (localLlmApiKey || '').trim(),
    };
  }
  return {};
}

/** @param {string} contactId @param {string} platform */
async function getCachedLatestMessage(contactId, platform) {
  const key = latestMessageCacheKey(contactId, platform);
  const row = (await chrome.storage.local.get(key))[key];
  return row && typeof row.fetchedAt === 'number' && row.response ? row : null;
}

/** @param {string} contactId @param {string} platform @param {object} response */
async function setCachedLatestMessage(contactId, platform, response) {
  const key = latestMessageCacheKey(contactId, platform);
  await chrome.storage.local.set({ [key]: { fetchedAt: Date.now(), response } });
}

/** Bump so popup / contacts page can refresh counts while LinkedIn sync streams batches (IndexedDB has no native change events). */
async function pingContactsUpdated() {
  try {
    const all = await storage.getAllContacts();
    await chrome.storage.local.set({
      prmContactsSyncStamp: Date.now(),
      prmContactsTotalCount: all.length,
    });
  } catch (e) {
    LOG('pingContactsUpdated failed:', e?.message || e);
  }
}

purgeExpiredLatestMessageCache().catch((e) => LOG('purgeExpiredLatestMessageCache failed', e));

chrome.runtime.onInstalled.addListener(async () => {
  await migrateRemovedChatGptProvider().catch((e) => LOG('migrateRemovedChatGptProvider failed', e));
  const state = await storage.getSyncState();
  if (!state) {
    await storage.saveSyncState({ lastSync: null, platformStatus: {} });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'WEBLLM_PROGRESS') {
    // Relayed from the offscreen document (chrome-extension/offscreen/mlc-engine.js) — offscreen
    // documents only support chrome.runtime, not chrome.storage, so the actual write happens
    // here. chrome.storage.onChanged then broadcasts it to every open extension page.
    const done = message.progress >= 1;
    chrome.storage.local
      .set({
        prmModelDownloadProgress: done
          ? null
          : { modelId: message.modelId, progress: message.progress, text: message.text, ts: Date.now() },
      })
      .catch(() => {});
    return false;
  }
  if (message.action === 'SYNC') {
    LOG('SYNC requested');
    handleSync().then((r) => { LOG('Sync result:', r); sendResponse(r); }).catch((err) => { LOG('Sync error:', err); sendResponse({ error: err.message }); });
    return true;
  }
  if (message.action === 'GET_SYNC_STATE') {
    storage.getSyncState().then((state) => {
      if (state?.platformStatus?.linkedin?.error?.includes('Open LinkedIn Connections in a tab')) {
        state.platformStatus.linkedin.error = 'Sign in at linkedin.com and click Sync again.';
        storage.saveSyncState(state).catch(() => {});
      }
      sendResponse(state);
    }).catch(() => sendResponse(null));
    return true;
  }
  if (message.action === 'GET_CONTACTS') {
    storage.getAllContacts().then(sendResponse).catch(() => sendResponse([]));
    return true;
  }
  if (message.action === 'GET_RECENT_CONTACTS') {
    storage.getAllContacts().then((contacts) => {
      const sorted = contacts
        .sort((a, b) => new Date(b.lastInteraction || 0) - new Date(a.lastInteraction || 0))
        .slice(0, 5);
      sendResponse(sorted);
    }).catch(() => sendResponse([]));
    return true;
  }
  if (message.action === 'GET_CONVERSATIONS') {
    storage.getConversationsForContact(message.contactId).then(sendResponse).catch(() => sendResponse([]));
    return true;
  }
  if (message.action === 'PARSE_FACTOIDS') {
    const text = message.text;
    const LEGACY_WEBLLM = 'Qwen2-0.5B-Instruct-q4f16_1-MLC';
    (async () => {
      await ensureOffscreenDocument();
      let modelId = await getSelectedModelId();
      if (modelId === LEGACY_WEBLLM) {
        modelId = DEFAULT_MODEL;
        await chrome.storage.local.set({ webllmModel: DEFAULT_MODEL });
      }
      const providerCreds = await getLlmProviderCredentials(modelId);
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'WEBLLM_PARSE_FACTOIDS', text, modelId, ...providerCreds },
          (response) => resolve(response || { error: 'No response from LLM' })
        );
      });
    })()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err?.message || 'Parse failed' }));
    return true;
  }
  if (message.action === 'ASK_AI_CHAT') {
    (async () => {
      try {
        const prompt = (message.prompt || '').trim();
        // previewOnly: Ask AI's live "full prompt" preview, built while the user is still typing —
        // must not trigger side effects (network fetches) that a real send would. overrideFullPrompt:
        // the user hand-edited that preview box before sending; chat-handler.js uses it verbatim
        // instead of reassembling from contextBlock/history/prompt. A populated override is enough
        // to proceed on its own — the user may have typed directly into the full-prompt box and
        // left the plain-text prompt input empty, which is a valid way to send.
        const previewOnly = !!message.previewOnly;
        const overrideFullPrompt = typeof message.overrideFullPrompt === 'string' ? message.overrideFullPrompt : '';
        if (!prompt && !overrideFullPrompt.trim()) {
          return { error: 'Prompt is empty.' };
        }
        let history = Array.isArray(message.history) ? message.history : [];
        const pendingDisambiguation = message.pendingDisambiguation || null;
        const priorFocusedContactId = message.focusedContactId || null;
        let focusedContactId = message.focusedContactId || null;

        const allContacts = await storage.getAllContacts();
        const contactById = new Map(allContacts.map((c) => [c.id, c]));

        // Explicit selection via the Ask AI page's @-mention autocomplete — the user picked an
        // exact contact off a list, not typed free text, so this completely bypasses text-based
        // name resolution (Steps 1/2 below) and any pending disambiguation. No ambiguity to
        // resolve regardless of how many contacts share that name (a real reported case: 30
        // "Alex"es on LinkedIn alone, where even an 8-candidate disambiguation cap wasn't enough).
        const mentionedContactId = typeof message.mentionedContactId === 'string' ? message.mentionedContactId : null;
        const mentionedContact = mentionedContactId ? contactById.get(mentionedContactId) || null : null;

        const factoidsCache = new Map();
        const getFactoids = async (id) => {
          if (!factoidsCache.has(id)) factoidsCache.set(id, await storage.getFactoidsByContactId(id));
          return factoidsCache.get(id);
        };

        let resolvedThisTurn = false;
        // When a disambiguation reply resolves the contact (narrowed or combined match below),
        // this holds the ORIGINAL pending question ("Where does Alex live?") so it can be resent
        // to the model in place of the bare reply ("Schleifer") — the application already knows
        // the answer to "which turn is this," so the model is never asked to reclassify a
        // one-word reply as fact-vs-clarification itself. See withContactContext for the prompt
        // simplification this enables.
        let pendingQuestionToAnswer = null;

        // Step 1: try to resolve a disambiguation question asked on the previous turn.
        if (!mentionedContact && pendingDisambiguation?.candidateIds?.length) {
          const candidates = pendingDisambiguation.candidateIds.map((id) => contactById.get(id)).filter(Boolean);
          const factoidsByContactId = {};
          for (const c of candidates) factoidsByContactId[c.id] = await getFactoids(c.id);
          const narrowed = resolveDisambiguationReply(prompt, candidates, factoidsByContactId);

          if (narrowed.length === 1) {
            focusedContactId = narrowed[0].id;
            resolvedThisTurn = true;
            pendingQuestionToAnswer = pendingDisambiguation.originalPrompt || null;
          } else {
            // Combine the original question with the reply (e.g. "Where does Alex live?" +
            // "Schleifer" -> "Where does Alex live? Schleifer") and re-run name-mention detection
            // against ALL contacts. resolveContactMention keeps only the best-scoring matches, so a
            // contact matching BOTH "alex" and "schleifer" (i.e. an actual "Alex Schleifer") outscores
            // every original candidate (which only matches "alex") and every unrelated Schleifer
            // (which only matches "schleifer") — resolving straight to the one person the combined
            // text actually names, even though they weren't in the original candidate list.
            const combined = pendingDisambiguation.originalPrompt
              ? resolveContactMention(`${pendingDisambiguation.originalPrompt} ${prompt}`, allContacts)
              : [];
            if (combined.length === 1) {
              focusedContactId = combined[0].id;
              resolvedThisTurn = true;
              pendingQuestionToAnswer = pendingDisambiguation.originalPrompt || null;
            }
          }
          if (!resolvedThisTurn) {
            // Escape hatch: if the reply unambiguously names one specific new person (not in the
            // ambiguous set), treat it as a fresh question instead of getting stuck re-asking
            // forever. Requires EXACTLY one fresh match, not just any — a reply that fails to
            // narrow the original candidates but happens to also match a DIFFERENT, unrelated
            // group of contacts (e.g. replying "Schleifer" to a "Which Alex?" question, where no
            // Alex has that surname but 5 completely different people do) is not a clear "I meant
            // someone else" signal, and abandoning the original question for a second, unrelated
            // disambiguation about that new group is worse than just asking the original question
            // again more specifically.
            const freshMention = resolveContactMention(prompt, allContacts);
            const isNewMention =
              freshMention.length === 1 &&
              !pendingDisambiguation.candidateIds.includes(freshMention[0].id);
            if (!isNewMention) {
              const stillCandidates = narrowed.length > 1 ? narrowed : candidates;
              // One per line, not comma-joined — a candidate's description can include a LinkedIn
              // headline/company (sometimes a full sentence or two), which makes a long inline
              // comma-separated list hard to read. See describeContactForDisambiguation.
              const list = stillCandidates
                .map((c) => `- ${describeContactForDisambiguation(c, factoidsByContactId[c.id])}`)
                .join('\n');
              // Re-surface how many matches aren't shown at all (see the note on SHOWN_CANDIDATE_LIMIT
              // below) — carried over from when the disambiguation was first asked, since
              // stillCandidates never grows past that original shown set.
              const moreNote = buildMoreCandidatesNote(pendingDisambiguation.remainingCount);
              return {
                answer: `I'm still not sure which one you mean:\n${list}${moreNote}\n\nCould you tell me more (e.g. their last name or where they work)?`,
                focusedContactId: null,
                focusedContactName: null,
                pendingDisambiguation: {
                  candidateIds: stillCandidates.map((c) => c.id),
                  originalPrompt: pendingDisambiguation.originalPrompt,
                  remainingCount: pendingDisambiguation.remainingCount,
                },
              };
            }
            // else: fall through to fresh detection below with the new mention.
          }
        }

        // Step 2: fresh name-mention detection (skip if a disambiguation was just resolved above,
        // or if an @-mention already told us exactly who this is).
        if (!mentionedContact && !resolvedThisTurn) {
          const mentioned = resolveContactMention(prompt, allContacts);
          if (mentioned.length > 1) {
            // Cap how many are actually shown/offered — a name shared by dozens of contacts (a
            // real reported case: 30 "Alex"es on LinkedIn alone) would otherwise dump all of them
            // into one message. Slice BEFORE fetching factoids too, so a large match count doesn't
            // mean fetching factoids for contacts that never even get shown.
            const shown = mentioned.slice(0, SHOWN_CANDIDATE_LIMIT);
            const remainingCount = mentioned.length - shown.length;
            const factoidsByContactId = {};
            for (const c of shown) factoidsByContactId[c.id] = await getFactoids(c.id);
            // One per line, not comma-joined — see the same note on the other disambiguation
            // message below (a LinkedIn headline/company can be a full sentence or two, which
            // makes a long inline comma-separated list hard to read).
            const list = shown
              .map((c) => `- ${describeContactForDisambiguation(c, factoidsByContactId[c.id])}`)
              .join('\n');
            const moreNote = buildMoreCandidatesNote(remainingCount);
            return {
              answer: `Which one did you mean?\n${list}${moreNote}`,
              focusedContactId: null,
              focusedContactName: null,
              pendingDisambiguation: { candidateIds: shown.map((c) => c.id), originalPrompt: prompt, remainingCount },
            };
          }
          if (mentioned.length === 1) {
            focusedContactId = mentioned[0].id;
          }
          // 0 matches: keep whatever focusedContactId carried over from the previous turn, so a
          // name-less follow-up like "What was the last thing we spoke about?" stays in context.
        }

        if (mentionedContact) focusedContactId = mentionedContact.id;

        const focusedContact = focusedContactId ? contactById.get(focusedContactId) || null : null;

        // The conversation just switched to (or first resolved) a different contact than whatever
        // was focused going into this turn — drop older history so answers about them can't be
        // contaminated by facts from whoever was discussed earlier in this same session. E.g.
        // replying "Yousuf" to a disambiguation question ("Which one did you mean — Azhar Yousuf,
        // azhar (WhatsApp)?", which itself carries focusedContactId=null since asking "which one?"
        // never resolves anyone) was producing answers about Azhar Yousuf that were actually about
        // a completely different contact discussed many turns earlier in the same conversation —
        // the model was drawing on stale, unrelated history rather than anything about Azhar
        // specifically. This is a hard, deterministic guard rather than another prompt-only patch,
        // since two prior prompt adjustments for related issues each fixed one symptom while
        // introducing another.
        //
        // Always drop history entirely on a contact switch now, including when this turn just
        // resolved a disambiguation (resolvedThisTurn) — previously kept the preceding exchange
        // (the pending question + the disambiguation reply) since the old single-call prompt
        // needed to SEE the pending question in history to know what to answer. That's no longer
        // true: sw.js already resends the original question directly as the current message
        // (pendingQuestionToAnswer, see below) under the multi-pass flow. Keeping it in history
        // TOO just duplicates it — and confirmed real bug: the model then sees "Where does Alex
        // live?" asked, a disambiguation question listing candidates that don't include the one
        // KNOWN INFORMATION is now scoped to, and the exact same question asked again with no
        // visible resolution in between. That looks unresolved even though KNOWN INFORMATION
        // already answers it, and models reasonably hedge/deny in the face of that contradiction
        // regardless of how clean the data itself is (verified: Qwen 2.5 7B still denied a
        // Location factoid with a minimal, single-line KNOWN INFORMATION block, purely from this).
        if (focusedContact && focusedContact.id !== priorFocusedContactId) {
          history = [];
        }

        await ensureOffscreenDocument();
        const modelId = await getSelectedModelId();
        const providerCreds = await getLlmProviderCredentials(modelId);

        // Gemma 3 1B's real usable context is far smaller than its configured KV cache buffer
        // (see mlc-engine.js) — a contact-focused prompt (system scaffold + KNOWN INFORMATION)
        // alone already lands close to that ceiling, so any carried-over conversation history is
        // the first thing to drop to keep each turn's prompt as close to that floor as possible.
        // Applied unconditionally whenever a contact is focused (not just on a contact switch,
        // unlike the trim above) since even continuing about the SAME contact would otherwise
        // keep accumulating history turn over turn. Scoped to this one model — Gemma 2 2B and
        // other models don't have this constraint and keep full history for multi-turn coherence.
        const GEMMA3_1B_MODEL_ID = 'gemma3-1b-it-q4f16_1-MLC';
        if (focusedContact && modelId === GEMMA3_1B_MODEL_ID) {
          history = [];
        }

        // On a turn that just resolved a disambiguation, send the model the ORIGINAL pending
        // question instead of the bare clarification reply ("Schleifer") — the application
        // already knows that reply wasn't a new question or a stated fact, so there's no reason
        // to make the model reclassify it. See the comment on pendingQuestionToAnswer above and
        // withContactContext below.
        const effectiveQuestion = pendingQuestionToAnswer || prompt;

        // Structured pieces for chat-handler.js's multi-pass flow (relevance pass -> minimal
        // answer pass -> separate extraction pass) — it builds and filters the actual
        // KNOWN INFORMATION text itself, rather than sw.js handing it a single pre-flattened
        // string, so it can narrow that block down to only what a given question needs before
        // ever showing it to the answer pass. See chat-handler.js for why: a noisy/irrelevant
        // KNOWN INFORMATION block is a plausible reason a model denies a fact that IS present
        // elsewhere in it — confirmed on a real "Location: San Francisco" factoid the model
        // (Qwen 2.5 7B) claimed wasn't on file, with an out-of-schema `headline` factoid sitting
        // right next to it breaking up the block's otherwise-uniform key:value structure.
        let contactFactoids = [];
        let contactConversations = [];
        if (focusedContact) {
          const effectiveIds = getEffectiveContactIds(focusedContact);
          for (const id of effectiveIds) contactFactoids.push(...(await getFactoids(id)));

          const looksConversational =
            /\b(talk|talked|talking|spoke|speak|said|say|mention|conversation|chat|message|discuss|meeting|email|text)\w*\b/i.test(
              effectiveQuestion,
            );

          if (looksConversational && !previewOnly) {
            for (const platform of Object.keys(focusedContact.platforms || {})) {
              try {
                await fetchAndSummarizeContactPlatform(focusedContact, platform, {});
              } catch (fetchErr) {
                LOG('ASK_AI_CHAT: fetch for context failed (non-fatal):', platform, fetchErr?.message || fetchErr);
              }
            }
          }

          const conversations = [];
          for (const id of effectiveIds) conversations.push(...(await storage.getConversationsForContact(id)));

          // Figure out each conversation's actual last-message recency so "what did we last talk
          // about" can be grounded in real dates instead of leaving the model to guess from an
          // unordered dump of summaries across networks — small/local models in particular tend to
          // just pick whichever summary reads most prominently rather than the truly newest one.
          const conversationsByRecency = conversations
            .filter((conv) => conv?.summary)
            .map((conv) => {
              const dates = (conv.messages || [])
                .map((m) => Date.parse(m?.date || ''))
                .filter((t) => Number.isFinite(t) && t > 0);
              return { conv, lastMs: dates.length ? Math.max(...dates) : 0 };
            })
            .sort((a, b) => b.lastMs - a.lastMs);

          contactConversations = conversationsByRecency.map(({ conv, lastMs }, idx) => ({
            platform: conv.platform,
            when: lastMs > 0 ? new Date(lastMs).toLocaleDateString() : 'unknown date',
            summary: conv.summary,
            isMostRecent: idx === 0 && conversationsByRecency.length > 1,
          }));
        }

        const offscreenRes = await chrome.runtime.sendMessage({
          action: 'WEBLLM_CHAT',
          prompt: effectiveQuestion,
          history,
          contactName: focusedContact?.displayName || '',
          factoids: contactFactoids,
          conversations: contactConversations,
          modelId,
          previewOnly,
          overrideFullPrompt,
          ...providerCreds,
        });

        // chat-handler.js now runs factoid extraction as its own dedicated pass (reusing the
        // already-proven PARSE_FACTOIDS_PROMPT/handleWebllmParseFactoids directly, in-process)
        // instead of parsing a "FACTOIDS: [...]" marker out of the answer text — the answer pass
        // no longer produces one at all. Merge whatever it found exactly as before.
        let finalAnswer = offscreenRes?.answer;
        const extractedFactoids = Array.isArray(offscreenRes?.extractedFactoids) ? offscreenRes.extractedFactoids : [];
        if (focusedContact && extractedFactoids.length) {
          if (resolvedThisTurn) {
            // This turn only resolved WHICH contact was meant (e.g. replying "Yousuf" to a
            // disambiguation question) — the user didn't state anything new about them, so
            // never act on extracted factoids here even if the extraction pass produced some.
            // A short, low-content reply like this is exactly the scenario most prone to
            // inventing a fact from unrelated earlier conversation history instead of anything
            // actually said in this message.
            LOG('ASK_AI_CHAT: ignoring extracted factoids on a disambiguation-resolving turn');
          } else {
            const candidates = extractedFactoids.filter(
              (f) => f && typeof f.key === 'string' && typeof f.value === 'string',
            );
            if (candidates.length) {
              const existingFactoids = await getFactoids(focusedContact.id);
              // "Also"/"too"/"another" etc. signal the new fact adds to an existing value
              // (e.g. another child) rather than replacing it — see looksAdditive.
              const additive = looksAdditive(prompt);
              const { merged, addedCount, updatedCount, changed } = mergeParsedFactoids(
                existingFactoids,
                candidates,
                'llm',
                additive,
              );
              if (addedCount > 0 || updatedCount > 0) {
                await storage.saveFactoidsForContact(focusedContact.id, merged);
                factoidsCache.set(focusedContact.id, merged);
                // Reflects the FINAL saved value (e.g. "Julia, Jeff"), not just the newly
                // extracted piece ("Jeff"), so an additive combine is confirmed accurately.
                const changedLines = changed.map((f) => `${f.key}: ${f.value}`);
                const verb = updatedCount > 0 && addedCount > 0 ? 'Saved' : updatedCount > 0 ? 'Updated' : 'Added';
                const confirmation = `${verb} — ${changedLines.join(', ')}.`;
                // Prefix onto the answer pass's own reply, unless it's empty/trivial — the answer
                // pass no longer produces a "Noted." itself (that was specific to the old combined
                // answer+extract prompt), but keep this defensive in case it ever does.
                const trimmedAnswer = (finalAnswer || '').trim();
                const isTrivialAck = /^(noted|got it|ok(ay)?|sure|understood|done|will do)[.!]*$/i.test(trimmedAnswer);
                finalAnswer = !trimmedAnswer || isTrivialAck ? confirmation : `${confirmation}\n\n${finalAnswer}`;
              }
            }
          }
        }

        return {
          ...(offscreenRes || { error: 'No response from AI' }),
          answer: finalAnswer,
          focusedContactId: focusedContact?.id || null,
          focusedContactName: focusedContact?.displayName || null,
          pendingDisambiguation: null,
        };
      } catch (e) {
        LOG('ASK_AI_CHAT error:', e?.message || e);
        return { error: e?.message || 'Ask AI failed.' };
      }
    })()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err?.message || 'Ask AI failed.' }));
    return true;
  }
  if (message.action === 'FETCH_FACEBOOK_LATEST_MESSAGE') {
    (async () => {
      try {
        const threadUrl = (message.threadUrl || '').trim();
        if (!threadUrl) {
          return { platform: 'facebook', error: 'Missing Facebook thread URL.' };
        }
        const pack = await getFacebookRecentMessagesFromThread(threadUrl, await getRecentMessagesLimit());
        if (!pack?.messages?.length) {
          return { platform: 'facebook', error: 'No messages found in Facebook thread.' };
        }
        const recent = pack.messages;
        const threadUpdatedAtMs = pack.threadUpdatedAtMs || 0;
        const fromMsgs = latestExchangeMsFromRecentMessages(recent);
        const lastExchangeAtMs = Math.max(fromMsgs, threadUpdatedAtMs);
        LOG('FETCH_FACEBOOK_LATEST_MESSAGE timing:', {
          threadUrl,
          threadUpdatedAtMs,
          threadUpdatedAtIso: threadUpdatedAtMs > 0 ? new Date(threadUpdatedAtMs).toISOString() : '(none)',
          fromMessagesMs: fromMsgs,
          fromMessagesIso: fromMsgs > 0 ? new Date(fromMsgs).toISOString() : '(none)',
          lastExchangeAtMs,
          lastExchangeAtIso: lastExchangeAtMs > 0 ? new Date(lastExchangeAtMs).toISOString() : '(none)',
        });
        return {
          platform: 'facebook',
          lastMessage: recent[recent.length - 1],
          recentMessages: recent,
          lastExchangeAtMs,
        };
      } catch (e) {
        LOG('FETCH_FACEBOOK_LATEST_MESSAGE error:', e?.message || e);
        return {
          platform: 'facebook',
          error: e?.message || 'Failed to fetch latest Facebook message.',
        };
      }
    })()
      .then(sendResponse)
      .catch((err) =>
        sendResponse({ platform: 'facebook', error: err?.message || 'Failed to fetch latest Facebook message.' }),
      );
    return true;
  }
  if (message.action === 'FETCH_LATEST_MESSAGE') {
    LOG('FETCH_LATEST_MESSAGE request:', {
      platform: message.platform,
      displayName: message.displayName,
      contactId: message.contactId,
      hasLinkedInProfileUrl: !!(message.linkedinProfileUrl && String(message.linkedinProfileUrl).trim()),
      forceRefresh: !!message.forceRefresh,
    });
    (async () => {
      try {
        // linkedin's caller passes displayName/linkedinProfileUrl directly rather than relying on
        // a stored contact (matches this action's original behavior); other platforms look the
        // contact up by id, same as before the fetchAndSummarizeContactPlatform extraction.
        const contact =
          message.platform === 'linkedin'
            ? {
                id: message.contactId,
                displayName: message.displayName,
                platforms: { linkedin: { profileUrl: message.linkedinProfileUrl } },
              }
            : await storage.getContact(message.contactId);
        return await fetchAndSummarizeContactPlatform(contact, message.platform, {
          forceRefresh: !!message.forceRefresh,
        });
      } catch (e) {
        LOG('FETCH_LATEST_MESSAGE: error:', e?.message || e);
        return {
          platform: message.platform,
          error: e?.message || 'Failed to fetch latest message.',
        };
      }
    })()
      .then(sendResponse)
      .catch((err) =>
        sendResponse({ error: err?.message || 'Latest message fetch failed.' }),
      );
    return true;
  }
});

async function ensureOffscreenDocument() {
  LOG('ensureOffscreenDocument');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  LOG('Existing offscreen contexts:', existingContexts.length);
  if (existingContexts.length > 0) return;
  LOG('Creating offscreen document');
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: 'Run WebLLM for summaries, factoids, and other extension tasks',
  });
  LOG('Offscreen document created');
}

/**
 * @param {number|string|null|undefined} deliveredAt
 */
function messageDeliveredAtToIso(deliveredAt) {
  if (deliveredAt == null || deliveredAt === '') return new Date().toISOString();
  if (typeof deliveredAt === 'number' && Number.isFinite(deliveredAt)) {
    return new Date(deliveredAt).toISOString();
  }
  const parsed = Date.parse(String(deliveredAt));
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return new Date().toISOString();
}

/**
 * Summarize recent thread via offscreen; save conversation only.
 * Contact-level "latest conversation" is chosen in the contacts page after all platform fetches.
 * @param {{ contactId: string, platform: string, threadId?: string, recentMessages: Array<{ text?: string, fromName?: string, deliveredAt?: number|string|null }>, convIdPrefix: string, lastExchangeAtMsOverride?: number }} args
 * @returns {Promise<{ summary?: string, lastExchangeAtMs: number }>}
 */
async function summarizeAndPersistRecentThread({
  contactId,
  platform,
  threadId,
  recentMessages,
  convIdPrefix,
  lastExchangeAtMsOverride,
}) {
  const fromMsgs = latestExchangeMsFromRecentMessages(recentMessages);
  const lastExchangeAtMs = Math.max(fromMsgs, Number(lastExchangeAtMsOverride) || 0);
  const combined = formatRecentMessagesForSummary(recentMessages);
  if (!contactId || !combined.trim()) return { summary: undefined, lastExchangeAtMs };

  await ensureOffscreenDocument();
  const modelId = await getSelectedModelId();
  const providerCreds = await getLlmProviderCredentials(modelId);
  const userName = ((await chrome.storage.local.get('userName')).userName || '').trim();
  const offscreenRes = await chrome.runtime.sendMessage({
    action: 'WEBLLM_SUMMARIZE_MESSAGE',
    text: combined,
    modelId,
    summaryVariant: 'recent_thread',
    userName,
    ...providerCreds,
  });
  if (offscreenRes?.error) {
    LOG('summarizeAndPersistRecentThread: summarize error:', offscreenRes.error);
  }
  const summary = offscreenRes?.summary;
  if (!summary) return { summary: undefined, lastExchangeAtMs };

  const convId = `${convIdPrefix}-${contactId}-latest`;
  const conv = {
    id: convId,
    contactId,
    platform,
    threadId: threadId || convId,
    messages: recentMessages.map((m) => ({
      id: generateId(),
      from: m.fromName || 'Unknown',
      to: 'Me',
      body: m.text || '',
      date: messageDeliveredAtToIso(m.deliveredAt),
      isFromMe: false,
    })),
    summary,
  };
  await storage.saveConversation(conv);
  LOG(
    'summarizeAndPersistRecentThread: saved conversation',
    platform,
    'messages=',
    recentMessages.length,
    'lastExchangeAtMs=',
    lastExchangeAtMs,
  );
  return { summary, lastExchangeAtMs };
}

/**
 * Fetch, cache, and summarize the latest message(s) for one contact/platform. Extracted from the
 * FETCH_LATEST_MESSAGE handler's inline per-platform logic so other flows (Ask AI) can reuse the
 * same cache-check + fetch + summarize orchestration without duplicating it. The underlying
 * per-platform fetch/parse functions this calls are untouched.
 * @param {import('../shared/types.js').Contact | null} contact
 * @param {import('../shared/types.js').Platform} platform
 * @param {{ forceRefresh?: boolean }} [options]
 */
async function fetchAndSummarizeContactPlatform(contact, platform, { forceRefresh = false } = {}) {
  const contactId = contact?.id;

  if (contactId && platform && !forceRefresh) {
    const refreshMs = await getConversationRefreshMs();
    if (refreshMs > 0) {
      const cached = await getCachedLatestMessage(contactId, platform);
      if (cached && Date.now() - cached.fetchedAt < refreshMs) {
        LOG(
          'fetchAndSummarizeContactPlatform: serving cached response (age ms=' + (Date.now() - cached.fetchedAt) + ')',
          platform,
          contactId,
        );
        return { ...cached.response, cached: true };
      }
    }
  }

  if (platform === 'linkedin') {
    const name = (contact?.displayName || '').trim();
    if (!name) {
      LOG('fetchAndSummarizeContactPlatform: missing contact name for LinkedIn');
      return { platform: 'linkedin', error: 'Missing contact name for LinkedIn message fetch.', lastExchangeAtMs: 0 };
    }

    LOG('fetchAndSummarizeContactPlatform: calling fetchLinkedInRecentMessagesForContact from background only');
    const liUrl = (contact?.platforms?.linkedin?.profileUrl || '').trim();
    const auth = await getLinkedInMessagingAuth();
    if (!auth?.csrfToken) throw new Error('Could not get LinkedIn CSRF token. Sign in at linkedin.com and try again.');
    if (!auth?.mailboxUrn) throw new Error('Could not determine LinkedIn mailbox URN. Open LinkedIn messaging in your browser and try again.');

    let fetched;
    try {
      fetched = await fetchLinkedInRecentMessagesForContact(
        name,
        await getRecentMessagesLimit(),
        auth,
        liUrl || undefined,
      );
    } catch (fetchErr) {
      LOG('fetchAndSummarizeContactPlatform: linkedin fetch threw:', fetchErr?.message || fetchErr);
      return {
        platform: 'linkedin',
        lastMessage: null,
        recentMessages: [],
        fetchedFromUrl: null,
        apiDiag: String(fetchErr?.message || fetchErr),
        lastExchangeAtMs: 0,
      };
    }
    LOG('fetchAndSummarizeContactPlatform: LinkedIn recent messages result:', fetched);

    let summary = undefined;
    const recentMessages = fetched?.recentMessages ?? [];
    const lastMessage = fetched?.lastMessage ?? null;
    const lastExchangeAtMs = latestExchangeMsFromRecentMessages(recentMessages);
    LOG('fetchAndSummarizeContactPlatform timing [linkedin]', {
      displayName: name,
      lastExchangeAtMs,
      lastExchangeAtIso: lastExchangeAtMs > 0 ? new Date(lastExchangeAtMs).toISOString() : '(none)',
      recentCount: recentMessages.length,
    });
    if (contactId && recentMessages.length > 0) {
      const hasText = recentMessages.some((m) => (m.text || '').trim());
      if (hasText) {
        try {
          const sumRes = await summarizeAndPersistRecentThread({
            contactId,
            platform: 'linkedin',
            threadId: fetched?.conversationUrl,
            recentMessages,
            convIdPrefix: 'linkedin',
          });
          summary = sumRes?.summary;
        } catch (sumErr) {
          LOG('fetchAndSummarizeContactPlatform: summarize/save failed (non-fatal):', sumErr?.message || sumErr);
        }
      }
    }

    const result = {
      platform: 'linkedin',
      lastMessage,
      recentMessages,
      summary,
      fetchedFromUrl: String(fetched?.conversationUrl || fetched?.fetchedApiUrl || '').trim() || null,
      apiDiag: fetched?.apiDiag || null,
      lastExchangeAtMs,
    };
    if (contactId) await setCachedLatestMessage(contactId, 'linkedin', result);
    return result;
  }

  if (platform === 'facebook') {
    if (!contactId) {
      return { platform: 'facebook', error: 'Missing contact id for Facebook message fetch.' };
    }
    const profileUrl = contact?.platforms?.facebook?.profileUrl;
    if (!profileUrl) {
      return { platform: 'facebook', error: 'This contact does not have a Facebook profile URL.' };
    }
    LOG('fetchAndSummarizeContactPlatform: fetching Facebook recent messages from profile URL', profileUrl);
    const threadUrl = await getFacebookMessagingUrlForContact(profileUrl);
    if (!threadUrl) {
      return {
        platform: 'facebook',
        error: 'Could not resolve Facebook messaging thread. Sign in to Facebook in this browser profile and try again.',
      };
    }
    const fbPack = await getFacebookRecentMessagesFromThread(threadUrl, await getRecentMessagesLimit());
    if (!fbPack?.messages?.length) {
      return { platform: 'facebook', error: 'No recent Facebook messages found.' };
    }
    const recentMessages = fbPack.messages;
    const threadUpdatedAtMs = fbPack.threadUpdatedAtMs || 0;
    const lastMessage = recentMessages[recentMessages.length - 1];
    const fromMsgs = latestExchangeMsFromRecentMessages(recentMessages);
    const lastExchangeAtMs = Math.max(fromMsgs, threadUpdatedAtMs);
    LOG('fetchAndSummarizeContactPlatform timing [facebook]', {
      threadUrl,
      threadUpdatedAtMs,
      lastExchangeAtMs,
    });

    let summary = undefined;
    const hasText = recentMessages.some((m) => (m.text || '').trim());
    if (hasText) {
      try {
        const sumRes = await summarizeAndPersistRecentThread({
          contactId,
          platform: 'facebook',
          threadId: threadUrl,
          recentMessages,
          convIdPrefix: 'facebook',
          lastExchangeAtMsOverride: threadUpdatedAtMs,
        });
        summary = sumRes?.summary;
      } catch (sumErr) {
        LOG('fetchAndSummarizeContactPlatform: Facebook summarize/save failed (non-fatal):', sumErr?.message || sumErr);
      }
    }

    const result = {
      platform: 'facebook',
      lastMessage,
      recentMessages,
      summary,
      fetchedFromUrl: String(threadUrl || '').trim() || null,
      lastExchangeAtMs,
    };
    await setCachedLatestMessage(contactId, 'facebook', result);
    return result;
  }

  if (platform === 'whatsapp') {
    if (!contactId) {
      return { platform: 'whatsapp', error: 'Missing contact id for WhatsApp message fetch.' };
    }
    const wa = contact?.platforms?.whatsapp;
    if (!wa) {
      return { platform: 'whatsapp', error: 'This contact does not have a WhatsApp profile.' };
    }
    const chatLabel = String(wa.name || contact?.displayName || '').trim();
    if (!chatLabel) {
      return { platform: 'whatsapp', error: 'Missing display name for WhatsApp chat match.' };
    }

    const recentMessagesLimit = await getRecentMessagesLimit();
    // Try in-memory store access first (no DOM scraping, fully background).
    // Falls back to DOM scraping if the store can't be accessed.
    let threadPack = await scrapeWhatsAppMessagesViaStoreInBackgroundTab(chatLabel, recentMessagesLimit, { log: LOG });
    if (!threadPack?.success) {
      LOG('fetchAndSummarizeContactPlatform: WA store access failed, falling back to DOM scrape:', threadPack?.error, threadPack?.storeDiag);
      threadPack = await scrapeWhatsAppThreadRecentMessagesViaBackgroundTab(chatLabel, recentMessagesLimit, { log: LOG });
    }

    let recentMessages = [];
    let fetchedFromUrl = WHATSAPP_WEB_URL;
    let sourceDebug = threadPack?.sourceDebug || {
      mechanism: 'whatsapp_thread_tab_scrape',
      listRootXPath: '(unknown)',
      messageSelectors: [],
      stage: 'no_debug_from_scraper',
    };
    if (threadPack?.success && Array.isArray(threadPack.messages) && threadPack.messages.length > 0) {
      recentMessages = threadPack.messages.map((m) => ({
        text: String(m.text || '').trim(),
        fromName: m.fromName || wa.name || contact?.displayName || 'Unknown',
        deliveredAt: m.deliveredAt ?? null,
      }));
      fetchedFromUrl = String(threadPack.fetchedFromUrl || WHATSAPP_WEB_URL).trim() || WHATSAPP_WEB_URL;
    } else {
      const preview = (wa.lastPreview || '').trim();
      if (!preview) {
        return {
          platform: 'whatsapp',
          error: threadPack?.error || 'No WhatsApp messages found. Sync WhatsApp or open web.whatsapp.com in this profile.',
          fetchedFromUrl,
          sourceDebug: {
            ...sourceDebug,
            threadScrapeSuccess: false,
            threadScrapeError: String(threadPack?.error || ''),
          },
        };
      }
      const deliveredAtMs = Date.parse(contact?.lastInteraction || '') || 0;
      recentMessages = [
        {
          text: preview,
          fromName: wa.name || contact?.displayName || 'Unknown',
          deliveredAt: deliveredAtMs || null,
        },
      ];
      sourceDebug = {
        ...sourceDebug,
        threadScrapeSuccess: false,
        threadScrapeError: String(threadPack?.error || ''),
        fallback: 'wa_lastPreview',
      };
    }

    const lastMessage = recentMessages[recentMessages.length - 1] || null;
    const lastExchangeAtMs = latestExchangeMsFromRecentMessages(recentMessages);

    let summary = undefined;
    const hasText = recentMessages.some((m) => (m.text || '').trim());
    if (hasText && recentMessages.length > 0) {
      try {
        const sumRes = await summarizeAndPersistRecentThread({
          contactId,
          platform: 'whatsapp',
          threadId: `${wa.chatKey || contactId}-wa-thread`,
          recentMessages,
          convIdPrefix: 'whatsapp',
        });
        summary = sumRes?.summary;
      } catch (sumErr) {
        LOG('fetchAndSummarizeContactPlatform: WhatsApp summarize/save failed (non-fatal):', sumErr?.message || sumErr);
      }
    }

    const result = {
      platform: 'whatsapp',
      lastMessage,
      recentMessages,
      summary,
      fetchedFromUrl,
      sourceDebug,
      lastExchangeAtMs,
    };
    await setCachedLatestMessage(contactId, 'whatsapp', result);
    return result;
  }

  if (platform === 'gmail') {
    if (!contactId) {
      return { platform: 'gmail', error: 'Missing contact id for Gmail message fetch.' };
    }
    const email = String(contact?.platforms?.gmail?.email || contact?.primaryEmail || '').trim().toLowerCase();
    if (!email) {
      return { platform: 'gmail', error: 'This contact does not have a Gmail email address.' };
    }
    const fetched = await scrapeGmailLatestMessageByEmailViaBackgroundTab(email, { log: LOG });
    if (!fetched?.success) {
      return {
        platform: 'gmail',
        error: fetched?.error || 'Could not load Gmail search results. Sign in at mail.google.com in this browser profile.',
      };
    }
    const text = String(fetched.lastMessageText || '').trim();
    if (!text) {
      return {
        platform: 'gmail',
        error: fetched.rowCount > 0 ? 'No message snippet found in Gmail search results.' : 'No Gmail messages found.',
      };
    }
    const fromNm = contact?.platforms?.gmail?.name || contact?.displayName || 'Unknown';
    const recentMessages = (fetched.recentSnippets || [text]).slice(0, await getRecentMessagesLimit()).map((t) => ({
      text: String(t || '').trim(),
      fromName: fromNm,
      deliveredAt: null,
    }));
    const result = {
      platform: 'gmail',
      lastMessage: { text, fromName: fromNm, deliveredAt: null },
      recentMessages,
      summary: undefined,
      fetchedFromUrl: String(fetched.searchUrl || '').trim() || null,
      lastExchangeAtMs: 0,
    };
    await setCachedLatestMessage(contactId, 'gmail', result);
    return result;
  }

  LOG('fetchAndSummarizeContactPlatform: unsupported platform', platform);
  return { platform, error: 'Unsupported platform for latest message.' };
}

// LinkedIn connections import: background `fetch` to pagination API only (no tab, no DOM scrape).
const CONNECTIONS_URL = 'https://www.linkedin.com/mynetwork/invite-connect/connections/';
const MESSAGING_URL = 'https://www.linkedin.com/messaging/';

/**
 * Extract LinkedIn contacts via SDUI pager POST + binary/JSON response parsing (service worker only).
 *
 * @param {number} extractionLimit - Max contacts to return
 * @param {(contacts: any[], page: number, importedCount: number) => Promise<void> | void} [onPageComplete]
 * @returns {Promise<any[]>} Array of contact-like objects
 */
async function extractLinkedInContactsViaPagination(
  extractionLimit = 50,
  onPageComplete = null,
) {
  LOG(
    'LinkedIn: extractLinkedInContactsViaPagination called with extractionLimit =',
    extractionLimit,
  );

  const contacts = [];
  /** @type {Set<string>} */
  const seenProfileUrlKeys = new Set();
  let startIndex = 0;
  const pageSize = 10;
  const maxPages = Math.max(Math.ceil(extractionLimit / pageSize), 20); // At least 20 pages so we keep paginating until empty

  // Start with a conservative estimate; we refine after the first page if
  // the response exposes a total count.
  let totalConnections = Math.max(extractionLimit, 1000);
  const startTime = Date.now();
  let importedCount = 0;
  let page = 0;
  let stopReason = 'completed';

  const sendProgressUpdate = async (done, total, message, startedAt, eta) => {
    LOG(
      'LinkedIn pagination progress:',
      done,
      '/',
      total,
      '| msg =',
      message,
      '| elapsed ms =',
      Date.now() - startedAt,
      '| eta =',
      eta ?? null,
    );
  };

  await sendProgressUpdate(
    0,
    totalConnections,
    'Starting LinkedIn import...',
    startTime,
  );

  try {
    // Derive CSRF token + pagerId from the LinkedIn connections page HTML.
    const authData = await extractLinkedInCSRFToken();
    if (!authData) {
      throw new Error(
        'Unable to extract CSRF token and pager ID from LinkedIn. Sign in at linkedin.com and try again.',
      );
    }

    const { csrfToken, pagerId } = authData;
    const cleanPagerId = pagerId.replace(/\\+$/, '').trim();
    LOG('LinkedIn: Using pager ID:', `"${cleanPagerId}"`);

    // Use the pagerId as the sduiid when constructing the pagination URL.
    const sduiid = cleanPagerId || 'com.linkedin.sdui.pagers.mynetwork.connectionsList';

    // Load configurable delay between pagination requests (ms).
    // One setting paces every paginator; floored so a saved 0 or tiny value cannot cause back-to-back requests.
    const delayMs = await getPaginationDelayMs();
    LOG('LinkedIn: Using pagination delay (ms):', delayMs);

    while (page < maxPages) {
      page++;
      LOG(
        'LinkedIn: Fetching page',
        page,
        '(startIndex =',
        startIndex,
        ')',
      );

      const payload = {
        pagerId: cleanPagerId,
        clientArguments: {
          $type: 'proto.sdui.actions.requests.RequestedArguments',
          payload: {
            startIndex,
            sortByOptionBinding: {
              key: 'connectionsListSortOption',
              namespace: 'connectionsListSortOptionMenu',
            },
          },
          requestedStateKeys: [
            {
              $type: 'proto.sdui.StateKey',
              value: 'connectionsListSortOption',
              key: {
                $type: 'proto.sdui.Key',
                value: {
                  $case: 'id',
                  id: 'connectionsListSortOption',
                },
              },
              namespace: 'connectionsListSortOptionMenu',
              isEncrypted: false,
            },
          ],
          requestMetadata: {
            $type: 'proto.sdui.common.RequestMetadata',
          },
          states: [
            {
              key: 'connectionsListSortOption',
              namespace: 'connectionsListSortOptionMenu',
              value: 'sortByRecentlyAdded',
            },
          ],
        },
        paginationRequest: {
          $type: 'proto.sdui.actions.requests.PaginationRequest',
          pagerId: cleanPagerId,
          requestedArguments: {
            $type: 'proto.sdui.actions.requests.RequestedArguments',
            payload: {
              startIndex,
              sortByOptionBinding: {
                key: 'connectionsListSortOption',
                namespace: 'connectionsListSortOptionMenu',
              },
            },
            requestedStateKeys: [
              {
                $type: 'proto.sdui.StateKey',
                value: 'connectionsListSortOption',
                key: {
                  $type: 'proto.sdui.Key',
                  value: {
                    $case: 'id',
                    id: 'connectionsListSortOption',
                  },
                },
                namespace: 'connectionsListSortOptionMenu',
                isEncrypted: false,
              },
            ],
            requestMetadata: {
              $type: 'proto.sdui.common.RequestMetadata',
            },
          },
          trigger: {
            $case: 'itemDistanceTrigger',
            itemDistanceTrigger: {
              $type: 'proto.sdui.actions.requests.ItemDistanceTrigger',
              preloadDistance: 3,
              preloadLength: 250,
            },
          },
          retryCount: 2,
        },
      };

      const paginationUrl = `https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?sduiid=${encodeURIComponent(sduiid)}`;
      LOG('LinkedIn: POST', paginationUrl, 'startIndex=', startIndex);

      const response = await fetch(paginationUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: '*/*',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.9',
          Origin: 'https://www.linkedin.com',
          Referer: CONNECTIONS_URL,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            'X-Li-Anchor-Page-Key': 'd_flagship3_people_connections',
            'X-Li-Rsc-Stream': 'true',
            'csrf-token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify(payload),
      });

      if (!response.ok) {
        LOG(
          'LinkedIn: pagination API failed with status',
          response.status,
          response.statusText,
        );
        if (page === 1) {
          throw new Error(
            `LinkedIn API request failed with status ${response.status}`,
          );
        } else {
          LOG(
            'LinkedIn: Stopping pagination at page',
            page,
            'due to API failure',
          );
          break;
        }
      }

      const responseText = await response.text();
      LOG('LinkedIn: pager response page', page, 'length =', responseText.length);
      LOG('LinkedIn: pager response body (full):', responseText);

      const navigateParsed = parseLinkedInConnectionsPageFromNavigateToUrl(
        responseText,
        page,
      );
      const pageContacts = navigateParsed.contacts;
      const strideCount = navigateParsed.strideCount;

      LOG(
        'LinkedIn: page',
        page,
        'NavigateToUrl accepted',
        pageContacts.length,
        'stride',
        strideCount,
        'skipped',
        navigateParsed.skippedCount,
        'hadPayload',
        navigateParsed.hadPayload,
      );
      if (page === 1 && navigateParsed.total != null) {
        totalConnections = navigateParsed.total;
        LOG('LinkedIn: Total connections from response:', totalConnections);
      }

      if (!navigateParsed.hadPayload || strideCount === 0) {
        if (page > 1 || contacts.length > 0) {
          stopReason = 'empty_page_after_progress';
          LOG(
            'LinkedIn: No absolute profile NavigateToUrl rows on this page, stopping pagination at page',
            page,
          );
          break;
        }
        LOG(
          'LinkedIn: No absolute profile NavigateToUrl rows on first page, trying next page...',
        );
        startIndex += pageSize;
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      LOG('LinkedIn: Page', page, 'parsed', pageContacts.length, 'contacts');

      const addedThisPage = [];
      for (const c of pageContacts) {
        const k = linkedInProfileUrlDedupeKey(c.profileUrl);
        if (!k || !k.includes('/in/')) continue;
        if (seenProfileUrlKeys.has(k)) continue;
        seenProfileUrlKeys.add(k);
        contacts.push(c);
        addedThisPage.push(c);
      }

      if (contacts.length > extractionLimit) {
        const removed = contacts.splice(extractionLimit);
        for (const c of removed) {
          const rk = linkedInProfileUrlDedupeKey(c.profileUrl);
          if (rk) seenProfileUrlKeys.delete(rk);
        }
        addedThisPage.splice(Math.max(0, addedThisPage.length - removed.length));
      }
      importedCount = contacts.length;

      // On first successful page, try to refine total count from the response text.
      if (page === 1) {
        try {
          const countPatterns = [
            /"totalElements":\s*(\d+)/i,
            /"total":\s*(\d+)/i,
            /"paging":\s*{[^}]*"totalElements":\s*(\d+)/i,
            /"pagination":\s*{[^}]*"totalElements":\s*(\d+)/i,
          ];
          for (const pattern of countPatterns) {
            const match = responseText.match(pattern);
            if (match?.[1]) {
              const count = parseInt(match[1], 10);
              if (count > 0) {
                totalConnections = count;
                LOG(
                  'LinkedIn: Updated total connections from first page response:',
                  totalConnections,
                );
                break;
              }
            }
          }
        } catch (updateError) {
          LOG(
            'LinkedIn: Could not update total count from response:',
            updateError.message,
          );
        }
      }

      const progressPercent = Math.min(
        Math.round((importedCount / totalConnections) * 100),
        100,
      );
      await sendProgressUpdate(
        importedCount,
        totalConnections,
        `Imported ${importedCount} contacts... (${progressPercent}%)`,
        startTime,
      );

      if (onPageComplete && addedThisPage.length > 0) {
        try {
          await onPageComplete(addedThisPage, page, contacts.length);
        } catch (err) {
          LOG(
            'LinkedIn: Error in onPageComplete for page',
            page,
            ':',
            err?.message || err,
          );
        }
      }

      if (contacts.length >= extractionLimit) {
        stopReason = 'extraction_limit_reached';
        LOG(
          'LinkedIn: Reached extraction limit',
          extractionLimit,
          '- stopping pagination',
        );
        break;
      }

      startIndex += strideCount;

      LOG('LinkedIn: Rate limiting - waiting', delayMs, 'ms before next request');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    await sendProgressUpdate(
      contacts.length,
      totalConnections,
      'LinkedIn import completed!',
      startTime,
      'Completed',
    );

    LOG(
      'LinkedIn: Pagination completed; total contacts extracted =',
      contacts.length,
    );
    return contacts.slice(0, extractionLimit);
  } catch (error) {
    LOG('LinkedIn: pagination API error:', error?.message || error);
    throw error;
  }
}

/**
 * Normalize LinkedIn profile slug: strip leading/trailing slashes and query string.
 * @param {string} slug - Raw slug (e.g. "philippebrule/" or "philippe-brule?foo=1")
 * @returns {string} Clean slug (e.g. "philippebrule", "philippe-brule")
 */
function normalizeLinkedInSlug(slug) {
  if (!slug || typeof slug !== 'string') return '';
  return slug.replace(/^\/+|\/+$/g, '').replace(/\?.*$/, '').trim();
}

/**
 * Log a single connection row skipped during LinkedIn NavigateToUrl import (name allowed for testing).
 * @param {number} page
 * @param {{ name?: string, reason: string, publicIdentifier?: string|null }} detail
 */
function logLinkedInConnectionSkipped(page, detail) {
  const displayName = detail.name || 'Unknown';
  const payload = {
    page,
    reason: detail.reason,
    name: displayName,
    publicIdentifier: detail.publicIdentifier ?? null,
  };
  LOG('LinkedIn import SKIP:', payload);
}

/**
 * True if `pid` looks like a LinkedIn vanity publicIdentifier (not an internal graph id).
 * @param {string} pid normalized slug
 */
function isValidLinkedInVanityPublicIdentifier(pid) {
  if (!pid || typeof pid !== 'string') return false;
  const s = pid.trim();
  if (s.length < 2 || s.length > 100) return false;
  if (/^ACo[A-Za-z0-9_-]{8,}$/i.test(s)) return false;
  if (/^ACw[A-Za-z0-9_-]{8,}$/i.test(s)) return false;
  if (/^AD[A-Za-z0-9_-]{8,}$/i.test(s)) return false;
  if (/^[A-Za-z0-9+/=_-]{20,}$/.test(s) && !/[-._]/.test(s)) return false;
  // Vanity slugs: letters/digits with segment separators . _ - (LinkedIn shape drift)
  return /^[\p{L}\p{N}]+(?:[._-][\p{L}\p{N}]+)*$/u.test(s);
}

/** JSON object `"url":"..."` values (any); we keep only absolute profile URLs. */
const LINKEDIN_JSON_URL_FIELD_RE = /"url"\s*:\s*"([^"]*)"/gi;

/**
 * Decode minimal JSON string escapes inside a captured `"url"` value.
 * @param {string} inner
 */
function decodeLinkedInPagerJsonUrlValue(inner) {
  if (!inner) return '';
  return inner
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * @param {string} responseText
 * @returns {Array<{ index: number, url: string }>}
 */
function collectAbsoluteLinkedInProfileNavigateUrlHits(responseText) {
  /** @type {Array<{ index: number, url: string }>} */
  const hits = [];
  if (!responseText) return hits;
  let m;
  LINKEDIN_JSON_URL_FIELD_RE.lastIndex = 0;
  while ((m = LINKEDIN_JSON_URL_FIELD_RE.exec(responseText)) !== null) {
    let decoded = decodeLinkedInPagerJsonUrlValue(m[1]);
    // Since 2026-10 the card's profile link is relative ("/in/<slug>/"); older responses were absolute.
    if (decoded.startsWith('/in/')) decoded = `https://www.linkedin.com${decoded}`;
    if (!decoded.startsWith('https://www.linkedin.com/in/')) continue;
    hits.push({ index: m.index, url: decoded });
  }
  return hits;
}

/**
 * Stride key: one pager row per normalized profile URL (collapses duplicate NavigateToUrl per card).
 * @param {string} absoluteUrl
 */
function linkedInNavigateProfileStrideKey(absoluteUrl) {
  const n = normalizeLinkedInProfileUrl(absoluteUrl);
  if (n && n.includes('/in/')) return n.toLowerCase();
  return `__raw__${absoluteUrl}`;
}

/**
 * @param {string} norm - From `normalizeLinkedInProfileUrl`
 */
function slugFromNormalizedLinkedInProfileUrl(norm) {
  if (!norm || typeof norm !== 'string') return '';
  const m = norm.match(/\/in\/([^/?#]+)/i);
  if (!m) return '';
  return normalizeLinkedInSlug(m[1]);
}

/**
 * Name from SDUI `"p",null,{...}"children":["Name"]` near the profile URL (forward slice only).
 * @param {string} slice
 */
function extractLinkedInNavigateCardNameFromSlice(slice) {
  let searchStart = 0;
  while (searchStart < slice.length) {
    const pIdx = slice.indexOf('"p",null,', searchStart);
    if (pIdx < 0) return '';
    const window = slice.slice(pIdx, pIdx + 2500);
    const m = window.match(/"children":\["((?:[^"\\]|\\.)*)"\]/);
    if (!m) {
      searchStart = pIdx + 1;
      continue;
    }
    const name = m[1]
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();
    if (
      name.length >= 1 &&
      name.length <= 200 &&
      !/^(Remove connection|Connected on |Message)$/i.test(name) &&
      !/^\$[A-Za-z0-9]+$/.test(name)
    ) {
      return name;
    }
    searchStart = pIdx + 1;
  }
  return '';
}

/**
 * Longest plausible headline from `"children":["..."]` fragments after the URL (skips date/button copy).
 * @param {string} slice
 * @param {string} nameHint
 */
function extractLinkedInNavigateCardHeadlineFromSlice(slice, nameHint) {
  const re = /"children":\["((?:[^"\\]|\\.)*)"\]/g;
  let best = '';
  let m;
  while ((m = re.exec(slice)) !== null) {
    const t = m[1]
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();
    if (t.length < 12 || t.length > 600) continue;
    if (/^Connected on /i.test(t)) continue;
    if (/^(Remove connection|Message)$/i.test(t)) continue;
    if (nameHint && t === nameHint) continue;
    if (t.length > best.length) best = t;
  }
  return best || undefined;
}

/**
 * @param {string} slice
 */
function extractNameHeadlineFromNavigateCardSlice(slice) {
  const name = extractLinkedInNavigateCardNameFromSlice(slice);
  const headline = extractLinkedInNavigateCardHeadlineFromSlice(slice, name);
  return { name, headline };
}

/**
 * Name/headline strings the current response carries as SDUI SetState "loading state" values
 * (`"id":"profile_name_loading_state"` ... `"stringValue":"<text>"`), in document order. Each card's strings come
 * BEFORE its profile URL, so a card's text is the nearest preceding entry.
 * @param {string} responseText
 * @param {'profile_name_loading_state' | 'profile_headline_loading_state'} stateId
 * @returns {Array<{ index: number, value: string }>}
 */
function collectLinkedInLoadingStateStrings(responseText, stateId) {
  const re = new RegExp(`"id"\\s*:\\s*"${stateId}"[\\s\\S]{0,400}?"stringValue"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'g');
  const out = [];
  for (const m of responseText.matchAll(re)) {
    let value = m[1];
    try {
      value = JSON.parse(`"${value}"`);
    } catch (_) {
      value = value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    out.push({ index: m.index, value: String(value).trim() });
  }
  return out;
}

/** The last entry that starts before `index` (entries are in document order). */
function nearestLoadingStateBefore(entries, index) {
  let best = null;
  for (const e of entries) {
    if (e.index < index) best = e;
    else break;
  }
  return best?.value || '';
}

/**
 * Single pipeline: identity only from absolute `https://www.linkedin.com/in/...` in JSON `"url"` fields
 * (NavigateToUrl). No `elements[]`, publicIdentifier, or URN fallbacks. Name/headline from the forward
 * text slice after each row’s first URL hit only.
 *
 * @param {string} responseText
 * @param {number} page
 * @returns {{ contacts: Array<{ name: string, profileUrl: string, headline?: string }>, total?: number, strideCount: number, hadPayload: boolean, skippedCount: number }}
 */
function parseLinkedInConnectionsPageFromNavigateToUrl(responseText, page) {
  const out = {
    contacts: [],
    total: undefined,
    strideCount: 0,
    hadPayload: false,
    skippedCount: 0,
  };

  const hits = collectAbsoluteLinkedInProfileNavigateUrlHits(responseText);
  if (hits.length === 0) {
    return out;
  }

  /** @type {Map<string, { index: number, url: string }>} */
  const firstByStrideKey = new Map();
  for (const h of hits) {
    const sk = linkedInNavigateProfileStrideKey(h.url);
    if (!firstByStrideKey.has(sk)) {
      firstByStrideKey.set(sk, { index: h.index, url: h.url });
    }
  }

  const rows = [...firstByStrideKey.values()].sort((a, b) => a.index - b.index);
  const loadingNames = collectLinkedInLoadingStateStrings(responseText, 'profile_name_loading_state');
  const loadingHeadlines = collectLinkedInLoadingStateStrings(responseText, 'profile_headline_loading_state');
  out.hadPayload = rows.length > 0;
  out.strideCount = rows.length;

  for (const { index, url: rawUrl } of rows) {
    const norm = normalizeLinkedInProfileUrl(rawUrl);
    const slug = slugFromNormalizedLinkedInProfileUrl(norm);
    if (!slug || !isValidLinkedInVanityPublicIdentifier(slug)) {
      out.skippedCount += 1;
      logLinkedInConnectionSkipped(page, {
        name: 'Unknown',
        reason: 'invalid_profile_url_slug',
        publicIdentifier: (slug || rawUrl).slice(0, 120),
      });
      continue;
    }

    const profileUrl = `https://www.linkedin.com/in/${slug}`;
    const dedupeKey = linkedInProfileUrlDedupeKey(profileUrl);
    if (!dedupeKey) {
      out.skippedCount += 1;
      logLinkedInConnectionSkipped(page, {
        name: 'Unknown',
        reason: 'invalid_profile_url_key',
        publicIdentifier: slug,
      });
      continue;
    }

    const sliceEnd = Math.min(responseText.length, index + 4500);
    const slice = responseText.slice(index, sliceEnd);
    // Current format: text from the loading-state strings before the URL; older format: "p" text nodes after it.
    const stateName = nearestLoadingStateBefore(loadingNames, index);
    const { name, headline } = stateName
      ? { name: stateName, headline: nearestLoadingStateBefore(loadingHeadlines, index) }
      : extractNameHeadlineFromNavigateCardSlice(slice);
    if (!name || !name.trim()) {
      out.skippedCount += 1;
      logLinkedInConnectionSkipped(page, {
        name: 'Unknown',
        reason: 'missing_name_in_card_slice',
        publicIdentifier: slug,
      });
      continue;
    }

    out.contacts.push({
      name: name.trim(),
      profileUrl,
      headline: headline || undefined,
    });
  }

  return out;
}

/**
 * Read LinkedIn's JSESSIONID cookie via the Chrome cookies API and derive the
 * CSRF token from it (the value is typically already in the "ajax:..." form).
 * This mirrors the page code that does:
 *   document.cookie.match(/JSESSIONID="?([^";]+)"?/)
 *
 * @returns {Promise<string|null>}
 */
async function getLinkedInCsrfFromCookies() {
  try {
    const cookie = await chrome.cookies.get({
      url: 'https://www.linkedin.com',
      name: 'JSESSIONID',
    });
    if (!cookie || !cookie.value) {
      LOG('LinkedIn: JSESSIONID cookie not found when deriving CSRF');
      return null;
    }
    let value = cookie.value;
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    LOG('LinkedIn: CSRF derived from JSESSIONID cookie:', value);
    return value;
  } catch (e) {
    LOG('LinkedIn: error reading JSESSIONID cookie for CSRF:', e?.message || e);
    return null;
  }
}

/** LinkedIn profile id segment in URNs (allows URL-safe base64-style ids). */
const LINKEDIN_FSD_PROFILE_ID_RE = '[A-Za-z0-9+/=_-]+';

/**
 * Best-effort extraction of the viewer's mailboxUrn (profile URN) from HTML.
 * We look for either an explicit mailboxUrn:urn:li:fsd_profile:... pattern,
 * or any "urn:li:fsd_profile:..." substring.
 *
 * @param {string} html
 * @returns {string|null}
 */
function extractLinkedInMailboxUrnFromHtml(html) {
  if (!html || typeof html !== 'string') return null;

  const idRe = LINKEDIN_FSD_PROFILE_ID_RE;

  // 1) mailboxUrn:urn:li:fsd_profile:...
  const directMatch = html.match(
    new RegExp(
      `mailboxUrn["']?\\s*[:=]\\s*["'](urn:li:fsd_profile:${idRe})["']`,
      'i',
    ),
  );
  if (directMatch && directMatch[1]) {
    LOG('LinkedIn: found mailboxUrn via mailboxUrn key:', directMatch[1]);
    return directMatch[1];
  }

  // 2) mailboxUrn with URL-encoded value (e.g. urn%3Ali%3Afsd_profile%3A...)
  const encodedMatch = html.match(
    new RegExp(
      `mailboxUrn["']?\\s*[:=]\\s*["'](urn%3Ali%3Afsd_profile%3A${idRe})["']`,
      'i',
    ),
  );
  if (encodedMatch && encodedMatch[1]) {
    try {
      const decoded = decodeURIComponent(encodedMatch[1]);
      LOG('LinkedIn: found mailboxUrn via encoded key:', decoded);
      return decoded;
    } catch (_) {}
  }

  // 3) JSON-style unicode escapes in raw HTML (literal \u003A sequences, not regex unicode)
  const unicodeEscMatch = html.match(
    /urn\\u003Ali\\u003Afsd_profile\\u003A([A-Za-z0-9+/=_-]+)/i,
  );
  if (unicodeEscMatch && unicodeEscMatch[1]) {
    const urn = `urn:li:fsd_profile:${unicodeEscMatch[1]}`;
    LOG('LinkedIn: found mailboxUrn via unicode-escaped fsd_profile:', urn);
    return urn;
  }

  // 4) Any urn:li:fsd_profile:... substring
  const urnMatch = html.match(new RegExp(`urn:li:fsd_profile:${idRe}`, 'i'));
  if (urnMatch && urnMatch[0]) {
    LOG('LinkedIn: found mailboxUrn via generic fsd_profile urn:', urnMatch[0]);
    return urnMatch[0];
  }

  // 5) Messaging sometimes embeds fs_miniProfile; GraphQL expects fsd_profile with same id tail.
  const miniMatch = html.match(new RegExp(`urn:li:fs_miniProfile:(${idRe})`, 'i'));
  if (miniMatch && miniMatch[1]) {
    const urn = `urn:li:fsd_profile:${miniMatch[1]}`;
    LOG('LinkedIn: derived mailboxUrn from fs_miniProfile in HTML:', urn);
    return urn;
  }

  LOG('LinkedIn: no mailboxUrn found in HTML');
  return null;
}

/**
 * When messaging HTML is a sparse shell, derive mailbox URN from Voyager /me JSON.
 * @param {string} csrfToken
 * @returns {Promise<string|null>}
 */
async function fetchLinkedInMailboxUrnFromVoyagerMe(csrfToken) {
  if (!csrfToken || typeof csrfToken !== 'string') return null;
  const url = 'https://www.linkedin.com/voyager/api/me';
  const requestHeaders = {
    'csrf-token': csrfToken,
    'x-restli-protocol-version': '2.0.0',
    accept: 'application/vnd.linkedin.normalized+json+2.1',
    'accept-language': 'en-US,en;q=0.9',
  };
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: requestHeaders,
    });
    const idRe = LINKEDIN_FSD_PROFILE_ID_RE;
    if (!res.ok) return null;
    const raw = await res.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch (_) {
      return null;
    }
    const blob = typeof raw === 'string' ? raw : '';
    const fsdInBody = blob.match(new RegExp(`urn:li:fsd_profile:${idRe}`, 'i'));
    if (fsdInBody && fsdInBody[0]) {
      LOG('LinkedIn: mailboxUrn from Voyager /me body (fsd_profile):', fsdInBody[0]);
      return fsdInBody[0];
    }
    const mini = json?.miniProfile?.entityUrn;
    if (typeof mini === 'string') {
      const m = mini.match(new RegExp(`^urn:li:fs_miniProfile:(${idRe})$`, 'i'));
      if (m && m[1]) {
        const urn = `urn:li:fsd_profile:${m[1]}`;
        LOG('LinkedIn: mailboxUrn from Voyager /me miniProfile -> fsd_profile:', urn);
        return urn;
      }
    }
  } catch (e) {
    LOG('LinkedIn: Voyager /me mailboxUrn fetch failed:', e?.message || e);
  }
  return null;
}

/**
 * Extract CSRF token and pagerId for LinkedIn using the connections page HTML.
 * This mirrors the sample implementation's CSRF/pagerId extraction logic and
 * is used by the LinkedIn connections sync flow.
 * @returns {Promise<{csrfToken: string, pagerId: string, mailboxUrn?: string} | null>}
 */
async function extractLinkedInCSRFToken() {
  LOG('LinkedIn: extracting CSRF token and pagerId from connections page');
  try {
    // Try to derive CSRF from the JSESSIONID cookie first (matches page code).
    let csrfToken = await getLinkedInCsrfFromCookies();

    const requestHeaders = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
    };
    LOG('LinkedIn: CSRF fetch request details (connections page):', {
      url: CONNECTIONS_URL,
      method: 'GET',
      credentials: 'include',
      headers: requestHeaders,
    });
    const res = await fetch(CONNECTIONS_URL, {
        method: 'GET',
        credentials: 'include',
        headers: requestHeaders,
    });

    LOG('LinkedIn: CSRF fetch response status:', res.status, res.statusText);
    LOG('LinkedIn: CSRF fetch response URL:', res.url);
    try {
      const headerObj = {};
      res.headers.forEach((value, key) => {
        headerObj[key] = value;
      });
      LOG('LinkedIn: CSRF fetch response headers:', headerObj);
    } catch (e) {
      LOG('LinkedIn: CSRF fetch response headers could not be read:', e?.message || e);
    }
    if (!res.ok) {
      LOG('LinkedIn: CSRF page fetch failed with status', res.status);
      return null;
    }

    const html = await res.text();
    LOG('LinkedIn: fetched HTML for CSRF/pagerId from connections, length =', html.length);
    LOG('LinkedIn: CSRF HTML preview (first 600 chars):', html.slice(0, 600));

    // If cookie lookup failed, fall back to HTML-based CSRF extraction.
    if (!csrfToken) {
    const metaMatch = html.match(
      /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i,
    );
    if (metaMatch) {
      csrfToken = metaMatch[1];
        LOG('LinkedIn: found CSRF token in meta tag');
      }
    }

    if (!csrfToken) {
      const scriptMatch =
        html.match(/["']csrf["']\s*:\s*["']([^"']+)["']/i) ||
        html.match(/csrfToken["']\s*:\s*["']([^"']+)["']/i) ||
        html.match(/["']X-CSRF-TOKEN["']\s*:\s*["']([^"']+)["']/i);
      if (scriptMatch) {
        csrfToken = scriptMatch[1];
        LOG('LinkedIn: found CSRF token in script');
      }
    }

    if (!csrfToken) {
      const ajaxCsrfMatch = html.match(/ajax:([a-zA-Z0-9\-_]+)/);
      if (ajaxCsrfMatch) {
        csrfToken = `ajax:${ajaxCsrfMatch[1]}`;
        LOG('LinkedIn: found CSRF token with ajax pattern');
      }
    }

    if (!csrfToken) {
      LOG('LinkedIn: no CSRF token found in HTML');
      return null;
    }

    // pagerId extraction (various patterns)
    let pagerId = null;

    const pagerMatches = [
      html.match(/["']pagerId["']\s*:\s*["']([^"']{10,})["']/i),
      html.match(/pager.*?id.*?["']([^"']*com\.linkedin[^"']*)["']/i),
      html.match(/["']([^"']*com\.linkedin\.sdui\.pagers[^"']*)["']/gi),
      html.match(/["']([^"']*mynetwork[^"']*connections[^"']*pager[^"']*)["']/gi),
      html.match(/pagerId.*?["']([^"']{10,})["']/gi),
    ];

    for (const matches of pagerMatches) {
      if (!matches) continue;
      const list = Array.isArray(matches) ? matches : [matches];
      for (const match of list) {
        if (match && match[1] && match[1].length > 10) {
          pagerId = match[1];
          LOG('LinkedIn: found potential pagerId:', pagerId);
        break;
      }
      }
      if (pagerId) break;
    }

    if (!pagerId) {
      const specificPagerMatch = html.match(
        /com\.linkedin\.sdui\.pagers[^"']*connections[^"']*/gi,
      );
      if (specificPagerMatch && specificPagerMatch.length > 0) {
        for (const match of specificPagerMatch) {
          if (match && match.length > 20) {
            pagerId = match;
            LOG('LinkedIn: found LinkedIn pager pattern:', pagerId);
            break;
          }
        }
      }
    }

    if (!pagerId) {
      const dataAttrMatch =
        html.match(/data-pager-id=["']([^"']{10,})["']/i) ||
        html.match(/componentkey=["']([^"']*connections[^"']*)["']/i);
      if (dataAttrMatch && dataAttrMatch[1] && dataAttrMatch[1].length > 10) {
        pagerId = dataAttrMatch[1];
        LOG('LinkedIn: found pagerId in data attributes:', pagerId);
      }
    }

    if (!pagerId) {
      const fallbackPagerId =
        'com.linkedin.sdui.pagers.mynetwork.connectionsList';
      LOG('LinkedIn: using fallback pagerId:', fallbackPagerId);
      pagerId = fallbackPagerId;
    }

    let mailboxUrn = extractLinkedInMailboxUrnFromHtml(html);

    // Connections page often doesn't include mailboxUrn; fetch messaging page as fallback.
    if (!mailboxUrn) {
      LOG('LinkedIn: no mailboxUrn on connections page, fetching messaging page for mailboxUrn');
      try {
        const msgRes = await fetch(MESSAGING_URL, {
          method: 'GET',
          credentials: 'include',
          headers: requestHeaders,
        });
        if (msgRes.ok) {
          const msgHtml = await msgRes.text();
          LOG('LinkedIn: messaging page HTML length =', msgHtml.length);
          mailboxUrn = extractLinkedInMailboxUrnFromHtml(msgHtml);
          if (mailboxUrn) {
            LOG('LinkedIn: found mailboxUrn from messaging page');
          }
    } else {
          LOG('LinkedIn: messaging page fetch status', msgRes.status);
        }
      } catch (e) {
        LOG('LinkedIn: messaging page fetch for mailboxUrn failed:', e?.message || e);
      }
    }

    return {
      csrfToken,
      pagerId: pagerId.replace(/\\+$/, '').trim(),
      ...(mailboxUrn ? { mailboxUrn } : {}),
    };
  } catch (e) {
    LOG('LinkedIn: error extracting CSRF/pagerId:', e?.message || e);
    return null;
  }
}

/**
 * Extract CSRF token and mailboxUrn specifically for the LinkedIn messaging
 * GraphQL endpoint. This uses the JSESSIONID cookie for CSRF (when present)
 * and always fetches the messaging page HTML to derive mailboxUrn.
 *
 * @returns {Promise<{ csrfToken: string, mailboxUrn?: string } | null>}
 */
async function getLinkedInMessagingAuth() {
  LOG('LinkedIn: extracting CSRF token and mailboxUrn from messaging page');
  try {
    // Try to derive CSRF from the JSESSIONID cookie first (matches page code).
    let csrfToken = await getLinkedInCsrfFromCookies();

    const requestHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    LOG('LinkedIn: messaging auth fetch request details:', {
      url: MESSAGING_URL,
      method: 'GET',
      credentials: 'include',
      headers: requestHeaders,
    });
    const res = await fetch(MESSAGING_URL, {
      method: 'GET',
      credentials: 'include',
      headers: requestHeaders,
    });

    LOG('LinkedIn: messaging auth response status:', res.status, res.statusText);
    LOG('LinkedIn: messaging auth response URL:', res.url);
    try {
      const headerObj = {};
      res.headers.forEach((value, key) => {
        headerObj[key] = value;
      });
      LOG('LinkedIn: messaging auth response headers:', headerObj);
    } catch (e) {
      LOG('LinkedIn: messaging auth response headers could not be read:', e?.message || e);
    }
    if (!res.ok) {
      LOG('LinkedIn: messaging auth page fetch failed with status', res.status);
      return null;
    }

    const html = await res.text();
    LOG('LinkedIn: fetched HTML for messaging auth, length =', html.length);
    LOG('LinkedIn: messaging HTML preview (first 600 chars):', html.slice(0, 600));

    // If cookie lookup failed, fall back to HTML-based CSRF extraction.
    if (!csrfToken) {
      const metaMatch = html.match(
        /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i,
      );
      if (metaMatch) {
        csrfToken = metaMatch[1];
        LOG('LinkedIn: found CSRF token in messaging meta tag');
      }
    }

    if (!csrfToken) {
      const scriptMatch =
        html.match(/["']csrf["']\s*:\s*["']([^"']+)["']/i) ||
        html.match(/csrfToken["']\s*:\s*["']([^"']+)["']/i) ||
        html.match(/["']X-CSRF-TOKEN["']\s*:\s*["']([^"']+)["']/i);
      if (scriptMatch) {
        csrfToken = scriptMatch[1];
        LOG('LinkedIn: found CSRF token in messaging script');
      }
    }

    if (!csrfToken) {
      const ajaxCsrfMatch = html.match(/ajax:([a-zA-Z0-9\-_]+)/);
      if (ajaxCsrfMatch) {
        csrfToken = `ajax:${ajaxCsrfMatch[1]}`;
        LOG('LinkedIn: found CSRF token in messaging with ajax pattern');
      }
    }

    if (!csrfToken) {
      LOG('LinkedIn: no CSRF token found in messaging HTML');
      return null;
    }

    let mailboxUrn = extractLinkedInMailboxUrnFromHtml(html);

    if (!mailboxUrn) {
      mailboxUrn = await fetchLinkedInMailboxUrnFromVoyagerMe(csrfToken);
    }

    return {
      csrfToken,
      ...(mailboxUrn ? { mailboxUrn } : {}),
    };
  } catch (e) {
    LOG('LinkedIn: error extracting messaging auth:', e?.message || e);
    return null;
  }
}

/**
 * Map a Voyager messaging GraphQL message element to a normalized row (matches Facebook scrape shape).
 * `isSelf` (distance === 'SELF', same signal linkedInMemberMatchesVanity uses) is included so callers
 * can tell the account owner's own messages apart from the other participant's — stripped before the
 * row is returned to any caller outside this file.
 * @param {object} msg
 * @returns {{ text: string, deliveredAt: number|null, fromName?: string, isSelf: boolean }}
 */
function linkedInGraphMessageToRow(msg) {
  const text = msg?.body?.text || '';
  const deliveredAt = msg?.deliveredAt ?? null;
  const firstName = msg?.actor?.participantType?.member?.firstName?.text || '';
  const lastName = msg?.actor?.participantType?.member?.lastName?.text || '';
  const fromName = [firstName, lastName].filter(Boolean).join(' ').trim() || undefined;
  const isSelf = msg?.actor?.participantType?.member?.distance === 'SELF';
  return { text, deliveredAt, fromName, isSelf };
}

/**
 * @param {string} profileUrl
 * @returns {string} Lowercase /in/ vanity slug or ''.
 */
function extractLinkedInProfileVanity(profileUrl) {
  const m = String(profileUrl || '').match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]).replace(/\/+$/, '').toLowerCase();
  } catch (_) {
    return m[1].replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * @param {object|undefined} member Voyager participantType.member
 * @param {string} vanity Lowercase slug
 */
function linkedInMemberMatchesVanity(member, vanity) {
  if (!member || member.distance === 'SELF' || !vanity) return false;
  if (
    typeof member.publicIdentifier === 'string' &&
    member.publicIdentifier.toLowerCase() === vanity
  ) {
    return true;
  }
  const urls = [
    member.navigationUrl,
    member.profileUrl,
    member.miniProfile?.navigationUrl,
  ].filter((u) => typeof u === 'string' && u);
  for (const url of urls) {
    const u = String(url).toLowerCase();
    if (u.includes(`/in/${vanity}`) || u.includes(`/in/${encodeURIComponent(vanity)}`)) {
      return true;
    }
  }
  return false;
}

/**
 * @param {object} conv messenger conversation element
 * @param {string} vanity from extractLinkedInProfileVanity
 */
function linkedInConversationMatchesVanity(conv, vanity) {
  if (!vanity) return false;
  const parts = conv?.conversationParticipants;
  if (!Array.isArray(parts)) return false;
  return parts.some((p) => linkedInMemberMatchesVanity(p.participantType?.member, vanity));
}

/**
 * @param {string} profileUrn
 * @returns {string}
 */
function normalizeLinkedInProfileUrn(profileUrn) {
  const raw = String(profileUrn || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch (_) {
    return raw;
  }
}

/**
 * Match conversation participants by exact profile URN by scanning the participant payload.
 * LinkedIn payload fields vary, so this intentionally checks the participant JSON blob.
 * @param {object} conv
 * @param {string} profileUrn
 * @returns {boolean}
 */
function linkedInConversationMatchesProfileUrn(conv, profileUrn) {
  const target = normalizeLinkedInProfileUrn(profileUrn);
  if (!target) return false;
  const parts = conv?.conversationParticipants;
  if (!Array.isArray(parts) || parts.length === 0) return false;
  return parts.some((p) => {
    try {
      const blob = JSON.stringify(p || {});
      return blob.includes(target);
    } catch (_) {
      return false;
    }
  });
}

/**
 * Strict display-name match: exact, or both sides have 2+ tokens and one's tokens are a subset of the other's.
 * Avoids `includes` substring matches (e.g. "John" → first "Johnny…" or top inbox thread).
 *
 * @param {string} wantNorm
 * @param {string} otherNorm
 * @returns {number} 0 = no match, 100 = exact, 80 = subset
 */
function linkedInDisplayNameMatchScore(wantNorm, otherNorm) {
  if (!wantNorm || !otherNorm) return 0;
  if (wantNorm === otherNorm) return 100;
  const wt = wantNorm.split(/\s+/).filter(Boolean);
  const ot = otherNorm.split(/\s+/).filter(Boolean);
  if (wt.length < 2 || ot.length < 2) return 0;
  const ws = new Set(wt);
  const os = new Set(ot);
  const wantSubsetOfOther = wt.every((t) => os.has(t));
  const otherSubsetOfWant = ot.every((t) => ws.has(t));
  if (wantSubsetOfOther || otherSubsetOfWant) return 80;
  return 0;
}

/**
 * @param {unknown} parts conv.conversationParticipants
 * @returns {string|null} The other (non-self) participant's display name, or null.
 */
function getLinkedInOtherParticipantName(parts) {
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    const member = p?.participantType?.member;
    if (!member || member.distance === 'SELF') continue;
    const firstName = member.firstName?.text || '';
    const lastName = member.lastName?.text || '';
    const name = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (name) return name;
  }
  return null;
}

/** @param {string} name */
function normalizeLinkedInDisplayName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Pick a single conversation or null (ambiguous / no match).
 *
 * @param {Array<object>} convs
 * @param {string} wantNorm normalized contact display name
 * @param {string} vanity from profile URL or ''
 * @param {(parts: unknown) => string|null} getOtherParticipantName
 * @param {(name: string) => string} normalizeName
 */
function pickLinkedInConversationForContact(
  convs,
  wantNorm,
  vanity,
  profileUrn,
  getOtherParticipantName,
  normalizeName,
) {
  if (profileUrn) {
    const urnHits = convs.filter((c) => linkedInConversationMatchesProfileUrn(c, profileUrn));
    if (urnHits.length === 1) {
      LOG('LinkedIn: matched conversation by profileUrn');
      return urnHits[0];
    }
    if (urnHits.length > 1) {
      LOG('LinkedIn: multiple conversations matched profileUrn; using most recent matched conversation');
      return urnHits[0];
    }
  }

  if (vanity) {
    const vanityHits = convs.filter((c) => linkedInConversationMatchesVanity(c, vanity));
    if (vanityHits.length === 1) {
      LOG('LinkedIn: matched conversation by profile vanity:', vanity);
      return vanityHits[0];
    }
    if (vanityHits.length > 1) {
      let best = null;
      let bestScore = -1;
      for (const c of vanityHits) {
        const on = normalizeName(getOtherParticipantName(c.conversationParticipants) || '');
        const s = linkedInDisplayNameMatchScore(wantNorm, on);
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }
      if (best && bestScore >= 80) {
        LOG('LinkedIn: matched among multiple vanity hits by name score:', bestScore);
        return best;
      }
      LOG('LinkedIn: multiple conversations share profile vanity; using first vanity hit');
      return vanityHits[0];
    }
  }

  const scored = [];
  for (const c of convs) {
    const otherName = getOtherParticipantName(c.conversationParticipants);
    if (!otherName) continue;
    const otherNorm = normalizeName(otherName);
    const score = linkedInDisplayNameMatchScore(wantNorm, otherNorm);
    if (score > 0) scored.push({ c, score, otherNorm });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0].score;
  const tied = scored.filter((x) => x.score === top);
  if (tied.length > 1) {
    LOG(
      'LinkedIn: ambiguous conversation match for name (',
      wantNorm,
      '),',
      tied.length,
      'candidates — skipping',
    );
    return null;
  }
  LOG('LinkedIn: matched conversation by strict name score:', top, 'peer:', tied[0].otherNorm);
  return tied[0].c;
}

/**
 * Fetch recent LinkedIn messages for a contact entirely from the service worker.
 * Uses two Voyager GraphQL calls: keyword search to find the conversation URN,
 * then messengerMessages to fetch the thread. No tabs opened.
 *
 * @param {string} contactName
 * @param {number} limit
 * @param {{ csrfToken: string, mailboxUrn: string }} auth
 * @param {string} [linkedinProfileUrl]
 */
async function fetchLinkedInRecentMessagesForContact(
  contactName,
  limit = RECENT_MESSAGES_FOR_SUMMARY,
  auth,
  linkedinProfileUrl,
) {
  const lim = Math.max(1, Math.min(Number(limit) || RECENT_MESSAGES_FOR_SUMMARY, 25));

  const headers = {
    'csrf-token': auth.csrfToken,
    'x-restli-protocol-version': '2.0.0',
    accept: 'application/graphql',
    'accept-language': 'en-US,en;q=0.9',
    'x-li-lang': 'en_US',
  };

  // Step 1: keyword search to find the conversation URN.
  const searchName = contactName.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const SEARCH_QUERY_ID = 'messengerConversations.737b27144cf922499202658a5345016f';
  const searchVariables =
    `(categories:List(INBOX,SPAM,ARCHIVE),count:20,firstDegreeConnections:false` +
    `,mailboxUrn:${encodeURIComponent(auth.mailboxUrn)},keywords:${encodeURIComponent(searchName)})`;
  const searchUrl =
    'https://www.linkedin.com/voyager/api/voyagerMessagingGraphQL/graphql' +
    `?queryId=${encodeURIComponent(SEARCH_QUERY_ID)}&variables=${searchVariables}`;

  LOG('LinkedIn: search request:', searchUrl);
  const searchRes = await fetch(searchUrl, { method: 'GET', credentials: 'include', headers });
  const searchRaw = await searchRes.text();
  if (!searchRes.ok) throw new Error(`LinkedIn search ${searchRes.status}: ${searchRaw.slice(0, 200)}`);

  let searchJson;
  try { searchJson = JSON.parse(searchRaw); } catch (e) {
    throw new Error(`LinkedIn search response not JSON: ${searchRaw.slice(0, 200)}`);
  }
  const convs = searchJson?.data?.messengerConversationsBySearchCriteria?.elements;
  if (!Array.isArray(convs) || convs.length === 0) {
    return { recentMessages: [], lastMessage: null, apiDiag: `No conversations found for "${searchName}"` };
  }

  // LinkedIn's keyword search matches on more than participant names (message content, company
  // names, etc.), and — critically — also does prefix/substring-style matching on names, so
  // searching "Alex Schleifer" can surface a conversation with "Alexandre Martel" ranked first.
  // Confirmed real bug: exactly that happened. Blindly taking convs[0] trusted the search's
  // ranking; pick the conversation whose actual participant matches this contact's known LinkedIn
  // profile (vanity slug from linkedinProfileUrl, most reliable) or — failing that — whose display
  // name strictly matches (no substring matching — see linkedInDisplayNameMatchScore) instead.
  const vanity = extractLinkedInProfileVanity(linkedinProfileUrl || '');
  const conv = pickLinkedInConversationForContact(
    convs,
    normalizeLinkedInDisplayName(searchName),
    vanity,
    '',
    getLinkedInOtherParticipantName,
    normalizeLinkedInDisplayName,
  );
  if (!conv) {
    return {
      recentMessages: [],
      lastMessage: null,
      apiDiag: `Found ${convs.length} LinkedIn conversation(s) via keyword search for "${searchName}", but couldn't confidently match one to this contact (ambiguous, or no participant name/profile match). Skipped to avoid showing the wrong person's messages.`,
    };
  }
  const entityUrn = conv?.entityUrn || conv?.dashEntityUrn || '';
  const backendUrn = conv?.backendUrn || '';
  const threadId = backendUrn.replace(/^urn:li:messagingThread:/, '').trim();
  const conversationUrl = threadId ? `https://www.linkedin.com/messaging/thread/${threadId}/` : undefined;

  if (!entityUrn) {
    return { recentMessages: [], lastMessage: null, conversationUrl, apiDiag: 'No entityUrn in search result' };
  }

  // Step 2: fetch messages using the conversation URN.
  // Encode ( and ) manually after encodeURIComponent to prevent browser URL normalisation.
  const MESSAGES_QUERY_ID = 'messengerMessages.5846eeb71c981f11e0134cb6626cc314';
  const encodedUrn = encodeURIComponent(entityUrn).replace(/\(/g, '%28').replace(/\)/g, '%29');
  const msgUrl =
    'https://www.linkedin.com/voyager/api/voyagerMessagingGraphQL/graphql' +
    `?queryId=${encodeURIComponent(MESSAGES_QUERY_ID)}` +
    `&variables=(conversationUrn:${encodedUrn})`;

  LOG('LinkedIn: messages request:', msgUrl);
  const msgRes = await fetch(msgUrl, { method: 'GET', credentials: 'include', headers });
  const msgRaw = await msgRes.text();
  if (!msgRes.ok) throw new Error(`LinkedIn messages ${msgRes.status}: ${msgRaw.slice(0, 200)}`);

  let msgJson;
  try { msgJson = JSON.parse(msgRaw); } catch (e) {
    throw new Error(`LinkedIn messages response not JSON: ${msgRaw.slice(0, 200)}`);
  }

  const elements =
    msgJson?.data?.messengerMessagesBySyncToken?.elements ||
    msgJson?.data?.messengerMessagesByConversation?.elements ||
    msgJson?.data?.messengerMessages?.elements ||
    msgJson?.data?.elements;

  if (!Array.isArray(elements) || elements.length === 0) {
    const dataKeys = Object.keys(msgJson?.data || {}).join(',');
    return { recentMessages: [], lastMessage: null, conversationUrl, apiDiag: `No messages. data keys: ${dataKeys}` };
  }

  const sorted = [...elements].sort((a, b) => (a?.deliveredAt ?? 0) - (b?.deliveredAt ?? 0));
  const rows = sorted.slice(-lim).map(linkedInGraphMessageToRow);

  // Verify the found conversation actually involves the person we searched for. LinkedIn's keyword
  // search (Step 1) matches message CONTENT too, not just participant names — convs[0] is not
  // guaranteed to be a conversation WITH the searched person, only one that mentions the keywords
  // somewhere. Confirmed real bug: searching "Zoe Schleifer" matched a conversation with a totally
  // different person whose thread happened to mention "Zoe" in passing. Check the other
  // participant's actual name (isSelf === false) against the search name before trusting this match.
  const wantTokens = new Set(
    searchName
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]+/gu, ''))
      .filter((w) => w.length >= 2),
  );
  const otherNames = new Set(
    rows.filter((m) => !m.isSelf && m.fromName).map((m) => m.fromName.toLowerCase()),
  );
  const hasMatchingParticipant = [...otherNames].some((name) =>
    name
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]+/gu, ''))
      .some((t) => wantTokens.has(t)),
  );
  if (otherNames.size > 0 && !hasMatchingParticipant) {
    LOG(
      'LinkedIn: search result does not appear to involve',
      searchName,
      '- other participant(s) were:',
      [...otherNames],
    );
    return {
      recentMessages: [],
      lastMessage: null,
      conversationUrl,
      apiDiag: `Found a LinkedIn conversation via keyword search for "${searchName}", but its other participant(s) (${[...otherNames].join(', ')}) don't match — likely a false-positive keyword match on message content, not the person's name. Skipped to avoid showing the wrong person's messages.`,
    };
  }

  const recentMessages = rows.map(({ isSelf, ...rest }) => rest);
  const lastMessage = recentMessages[recentMessages.length - 1];
  LOG('LinkedIn: fetched', elements.length, 'messages');
  return { recentMessages, lastMessage, conversationUrl };
}

async function syncFacebook(platformStatus) {
  try {
    LOG('Facebook: try /friends/list embedded JSON (data-sjs) first');
    const sjs = await facebookTryFetchFriendsFromFriendsListPageSjs();
    if (sjs.success && sjs.contacts.length > 0) {
      LOG('Facebook: imported', sjs.contacts.length, 'friends from friends/list SJS');
      await processFacebookConnections(sjs.contacts);
      platformStatus.facebook = { success: true };
      return;
    }
    LOG(
      'Facebook: SJS path empty (status',
      sjs.status,
      'bodyLen',
      sjs.rawBodyLen,
      '); falling back to GraphQL',
    );
    LOG('Facebook: friends list via background GET (tokens) + POST https://www.facebook.com/api/graphql/');
    const init = await facebookInitTokensWithCredentials();
    if (!init.success) {
      LOG('Facebook: init failed', init.error);
      platformStatus.facebook = { success: false, error: init.error || 'Failed to init Facebook session' };
      return;
    }
    const session = init.tokens;
    const pageSize = 30;
    const paged = await collectCursorPages({
      delayMs: await getPaginationDelayMs(),
      fetchPage: async (cursor, page) => {
        const result = await facebookFetchFriendsPageWithCredentials(session, { cursor, count: pageSize });
        if (!result.success) LOG('Facebook: fetch failed on page', page, result.error);
        else LOG('Facebook: page', page, 'contacts', result.contacts?.length ?? 0, 'nextCursor', result.nextCursor ? 'yes' : 'no');
        return { success: result.success, items: result.contacts, nextCursor: result.nextCursor, error: result.error };
      },
    });
    if (!paged.success) {
      platformStatus.facebook = { success: false, error: paged.error || 'Facebook fetch failed' };
      return;
    }
    const all = paged.items;
    LOG('Facebook: total contacts collected', all.length);
    if (all.length > 0) {
      LOG('Facebook: calling processFacebookConnections with', all.length, 'contacts');
      await processFacebookConnections(all);
      LOG('handleSync: Facebook saved', all.length, 'friends');
      platformStatus.facebook = { success: true };
    } else {
      LOG('Facebook: no contacts to save');
      platformStatus.facebook = {
        success: false,
        error:
          'No friends returned from Facebook. Open facebook.com/friends/list in a tab, reload it, then sync again.',
      };
    }
  } catch (e) {
    platformStatus.facebook = { success: false, error: e?.message || 'Facebook sync failed' };
    LOG('handleSync: Facebook exception', e?.message, e?.stack);
  }
}

/**
 * Prefer inactive-tab DOM scrape (runs FB client JS), then fall back to fetch + regex HTML parse.
 * @param {string} threadUrl
 * @param {number} [limit]
 * @returns {Promise<{ messages: Array<{ text: string, fromName?: string, deliveredAt?: null }>, threadUpdatedAtMs: number } | null>}
 */
async function getFacebookRecentMessagesFromThread(threadUrl, limit = RECENT_MESSAGES_FOR_SUMMARY) {
  const lim = Math.max(1, Math.min(Number(limit) || RECENT_MESSAGES_FOR_SUMMARY, 25));
  const tabRes = await scrapeFacebookMessengerThreadViaBackgroundTab(threadUrl, { log: LOG });
  if (tabRes.success) {
    // XPath container is message bubbles only — Relay JSON (updated_time) lives in full document.
    let threadUpdatedAtMs = extractFacebookThreadUpdatedAtMsFromHtml(tabRes.innerHTML || '', threadUrl);
    let threadTimeSource = 'messages-container-html';
    if (threadUpdatedAtMs === 0) {
      try {
        const fullHtml = await fetchFacebookThreadHtml(threadUrl);
        threadUpdatedAtMs = extractFacebookThreadUpdatedAtMsFromHtml(fullHtml, threadUrl);
        threadTimeSource = 'full-page-fetch';
        LOG('getFacebookRecentMessagesFromThread: thread time from full-page fetch (container had no JSON)', {
          threadUpdatedAtMs,
          threadUpdatedAtIso: threadUpdatedAtMs > 0 ? new Date(threadUpdatedAtMs).toISOString() : '(none)',
          htmlChars: fullHtml.length,
        });
      } catch (e) {
        LOG('getFacebookRecentMessagesFromThread: full-page fetch for thread time failed', e?.message || e);
      }
    }
    let parsed = extractRecentFacebookMessagesFromMessengerContainer(tabRes.innerText, lim);
    if (parsed.length === 0 && tabRes.innerHTML) {
      parsed = extractRecentFacebookMessagesFromThreadHtml(tabRes.innerHTML, lim);
    }
    if (parsed.length === 0) {
      const single = extractLatestFacebookMessageFromMessengerContainer(tabRes.innerText);
      if (single) parsed = [single];
    }
    if (parsed.length === 0 && (tabRes.innerText || '').trim().length > 200) {
      parsed = [
        {
          text: tabRes.innerText.trim().slice(-4000),
          fromName: undefined,
          deliveredAt: null,
        },
      ];
    }
    if (parsed.length > 0) {
      LOG('getFacebookRecentMessagesFromThread: from background tab scrape', {
        messageCount: parsed.length,
        threadUpdatedAtMs,
        threadUpdatedAtIso: threadUpdatedAtMs > 0 ? new Date(threadUpdatedAtMs).toISOString() : '(none)',
        threadTimeSource,
        innerHTMLChars: (tabRes.innerHTML || '').length,
      });
      return { messages: parsed, threadUpdatedAtMs };
    }
  } else {
    LOG('getFacebookRecentMessagesFromThread: tab scrape unavailable, using fetch', tabRes?.error || '');
  }

  try {
    const html = await fetchFacebookThreadHtml(threadUrl);
    const threadUpdatedAtMs = extractFacebookThreadUpdatedAtMsFromHtml(html, threadUrl);
    const parsed = extractRecentFacebookMessagesFromThreadHtml(html, lim);
    if (parsed.length > 0) {
      LOG('getFacebookRecentMessagesFromThread: from fetch HTML', {
        messageCount: parsed.length,
        threadUpdatedAtMs,
        threadUpdatedAtIso: threadUpdatedAtMs > 0 ? new Date(threadUpdatedAtMs).toISOString() : '(none)',
        htmlChars: html.length,
      });
      return { messages: parsed, threadUpdatedAtMs };
    }
    return null;
  } catch (e) {
    LOG('getFacebookRecentMessagesFromThread: fetch fallback failed', e?.message || e);
    return null;
  }
}

/**
 * Fetch the raw HTML of a Facebook Messenger thread.
 * @param {string} threadUrl
 * @returns {Promise<string>}
 */
async function fetchFacebookThreadHtml(threadUrl) {
  LOG(
    'facebook-request: goal=',
    'GET Messenger thread HTML to parse latest message',
    '| url=',
    threadUrl,
  );

  const cookieProbe = (await getFacebookCookieHeaderForDocumentFetch()).trim();
  if (!cookieProbe) {
    throw new Error('No Facebook cookies for this profile. Sign in at facebook.com.');
  }
  LOG(
    'fetchFacebookThreadHtml: chrome.cookies jar ok length≈',
    cookieProbe.length,
    '| wire: credentials=include',
  );

  const res = await fetch(threadUrl, {
    method: 'GET',
    credentials: 'include',
    redirect: 'follow',
    headers: {
      ...FACEBOOK_CURL_LIKE_GET_HEADERS,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    LOG('fetchFacebookThreadHtml: non-OK status', res.status, text.slice(0, 200));
    throw new Error(`Facebook thread fetch failed with status ${res.status}`);
  }
  const html = await res.text();
  LOG('fetchFacebookThreadHtml: got HTML length', html.length);
  return html;
}

async function getFacebookMessagingUrlForContact(profileUrl) {
  const normalizedProfile = (profileUrl || '').trim();
  if (!normalizedProfile) {
    LOG('getFacebookMessagingUrlForContact: missing profile URL');
    return null;
  }

  try {
    LOG(
      'facebook-request: goal=',
      'resolve Messenger thread URL from profile HTML (messages/e2ee/t or messages/t URL)',
      '| profileUrl=',
      normalizedProfile,
    );
    const res = await resolveMessagingUrlFromProfileHtml(normalizedProfile, {
      log: (...a) => LOG('[PRM facebook-profile]', ...a),
    });
    if (res?.messagingUrl) {
      LOG('getFacebookMessagingUrlForContact: ok', res.messagingUrl);
      return res.messagingUrl;
    }
    if (res?.error) {
      LOG('getFacebookMessagingUrlForContact:', res.error);
    }
  } catch (e) {
    LOG('getFacebookMessagingUrlForContact: failed', e?.message || e);
  }
  return null;
}

/**
 * Heuristic: collect non-trivial text from `<div dir="auto">` nodes (Messenger thread HTML).
 * @param {string} html
 * @param {number} [limit]
 * @returns {Array<{ text: string, fromName?: string, deliveredAt?: null }>}
 */
function extractRecentFacebookMessagesFromThreadHtml(html, limit = 5) {
  try {
    if (!html) return [];
    const lim = Math.max(1, Math.min(Number(limit) || 5, 25));
    const regex = /<div[^>]*dir="auto"[^>]*>([\s\S]*?)<\/div>/gi;
    let match;
    const collected = [];
    let totalCandidates = 0;
    const sampleCandidates = [];
    let sampleSkipped = 0;
    while ((match = regex.exec(html)) !== null) {
      const raw = match[1] || '';
      const stripped = raw.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      if (!stripped) continue;
      totalCandidates++;
      if (
        stripped === 'You sent' ||
        stripped === 'Enter' ||
        stripped.startsWith('New messages and calls are secured with end-to-end encryption')
      ) {
        sampleSkipped++;
        if (sampleCandidates.length < 10) sampleCandidates.push({ skipped: true, text: stripped.slice(0, 120) });
        continue;
      }
      if (sampleCandidates.length < 10) sampleCandidates.push({ skipped: false, text: stripped.slice(0, 120) });
      collected.push({
        text: stripped,
        fromName: undefined,
        deliveredAt: null,
      });
    }
    const slice = collected.slice(-lim);
    if (slice.length === 0) {
      LOG('extractRecentFacebookMessagesFromThreadHtml: no candidate text found', {
        totalCandidates,
        sampleSkipped,
        sampleCandidates,
      });
      return [];
    }
    LOG('extractRecentFacebookMessagesFromThreadHtml: got', slice.length, 'chunk(s)', {
      totalCandidates,
      sampleSkipped,
    });
    return slice;
  } catch (e) {
    LOG('extractRecentFacebookMessagesFromThreadHtml: error', e?.message || e);
    return [];
  }
}

async function handleSync() {
  const platformStatus = {
    linkedin: { success: false },
    facebook: { success: false },
    whatsapp: { success: false },
    gmail: { success: false },
  };
  const { syncLinkedInEnabled, syncFacebookEnabled, syncWhatsAppEnabled, syncGmailEnabled } =
    await chrome.storage.local.get([
      'syncLinkedInEnabled',
      'syncFacebookEnabled',
      'syncWhatsAppEnabled',
      'syncGmailEnabled',
    ]);
  const linkedInEnabled = syncLinkedInEnabled !== false;
  const facebookEnabled = syncFacebookEnabled !== false;
  const whatsappEnabled = syncWhatsAppEnabled !== false;
  const gmailEnabled = syncGmailEnabled !== false;

  if (linkedInEnabled) {
    try {
      const { importLimit } = await chrome.storage.local.get('importLimit');
      let connections = null;
      const PAGINATION_NO_LIMIT = 50000;
      const paginationLimit = importLimit > 0 ? importLimit : PAGINATION_NO_LIMIT;
      const linkedInImportCap =
        paginationLimit === PAGINATION_NO_LIMIT ? Number.POSITIVE_INFINITY : paginationLimit;
      let linkedInRowsMergedThisSync = 0;
      let linkedInSavedIncrementally = false;

      async function flushLinkedInConnectionBatch(rawBatch) {
        if (!rawBatch?.length) return;
        const remaining = Number.isFinite(linkedInImportCap)
          ? Math.max(0, linkedInImportCap - linkedInRowsMergedThisSync)
          : rawBatch.length;
        if (remaining <= 0) return;
        const slice = rawBatch.slice(0, remaining);
        linkedInRowsMergedThisSync += slice.length;
        await mergeLinkedInConnectionsBatch(slice);
        linkedInSavedIncrementally = true;
        await pingContactsUpdated();
      }

      LOG('handleSync: LinkedIn import via pagination API (background only), limit =', paginationLimit);
      try {
        const paged = await extractLinkedInContactsViaPagination(paginationLimit, flushLinkedInConnectionBatch);
        if (Array.isArray(paged) && paged.length > 0) {
          connections = paged;
          LOG('handleSync: pagination returned', connections.length, 'contacts');
        } else {
          platformStatus.linkedin.error =
            'LinkedIn returned no connections. Sign in at linkedin.com in this browser, then try Sync again. If you are signed in, LinkedIn may have changed their API.';
          LOG('handleSync: pagination returned 0 contacts');
        }
      } catch (e) {
        const msg = e?.message || String(e);
        platformStatus.linkedin.error = msg.trim()
          ? msg
          : 'LinkedIn import failed. Sign in at linkedin.com in this browser and try Sync again.';
        LOG('handleSync: pagination error', msg, e?.stack);
      }

      if (connections?.length > 0) {
        if (!linkedInSavedIncrementally) {
          const limit = importLimit > 0 ? importLimit : connections.length;
          const toProcess = connections.slice(0, limit);
          if (limit < connections.length) {
            LOG('handleSync: import limit', limit, '- processing', toProcess.length, 'of', connections.length);
          } else {
            LOG(
              'handleSync: processing',
              connections.length,
              'connections:',
              connections.map((c) => c.name || c.profileUrl),
            );
          }
          await processConnections(toProcess);
        } else {
          LOG(
            'handleSync: LinkedIn merged incrementally during fetch (',
            linkedInRowsMergedThisSync,
            'rows); skipping final bulk processConnections',
          );
        }
        platformStatus.linkedin.success = true;
        const total = await storage.getAllContacts();
        LOG('handleSync: LinkedIn done; total contacts in DB:', total.length);
      } else if (!platformStatus.linkedin.error) {
        platformStatus.linkedin.error =
          'No LinkedIn contacts were imported. Sign in at linkedin.com in this browser and try Sync again.';
        LOG('handleSync: no contacts extracted');
      }
    } catch (e) {
      platformStatus.linkedin.error = e.message || 'LinkedIn sync failed';
      LOG('handleSync: exception', e.message, e.stack);
    }
  } else {
    LOG('handleSync: LinkedIn disabled in settings, skipping');
  }

  if (facebookEnabled) {
    await syncFacebook(platformStatus);
  } else {
    LOG('handleSync: Facebook disabled in settings, skipping');
  }

  if (whatsappEnabled) {
    await syncWhatsApp(platformStatus);
  } else {
    LOG('handleSync: WhatsApp disabled in settings, skipping');
  }

  if (gmailEnabled) {
    await syncGmail(platformStatus);
  } else {
    LOG('handleSync: Gmail / Google Contacts disabled in settings, skipping');
  }

  const syncState = {
    lastSync: new Date().toISOString(),
    platformStatus,
  };
  await storage.saveSyncState(syncState);
  await pingContactsUpdated();
  return syncState;
}

async function syncGmail(platformStatus) {
  try {
    LOG('Gmail: scraping Google Contacts lists via temporary tabs', GOOGLE_CONTACTS_SYNC_URLS.length, 'URLs');
    /** @type {Map<string, { name: string, email: string }>} */
    const byEmail = new Map();
    /** @type {string[]} */
    const scrapeErrors = [];

    const delayMs = await getPaginationDelayMs();
    for (const [i, pageUrl] of GOOGLE_CONTACTS_SYNC_URLS.entries()) {
      if (i > 0) await pause(delayMs); // the lists are loaded one after another; pace them like any other paginator
      const scraped = await scrapeGoogleContactsPageViaBackgroundTab(pageUrl, { log: LOG });
      const diag = scraped?.googleContactsDiag;
      if (!scraped?.success || !Array.isArray(scraped.contacts)) {
        const msg = scraped?.error || 'Scrape failed';
        LOG('Gmail: page scrape failed', pageUrl, msg, diag);
        scrapeErrors.push(`${pageUrl}: ${msg}`);
        continue;
      }
      for (const row of scraped.contacts) {
        const email = String(row?.email || '')
          .trim()
          .toLowerCase();
        if (!email) continue;
        const name = String(row?.name || '').trim();
        const prev = byEmail.get(email);
        if (!prev) {
          byEmail.set(email, { email, name });
        } else {
          const bestName = name.length > (prev.name || '').length ? name : prev.name;
          byEmail.set(email, { email, name: bestName });
        }
      }
      if (diag?.skippedEmptyByHeaderCount) {
        LOG('Gmail: page skipped (header count 0)', pageUrl, diag?.headerCountLabel, diag);
      } else {
        LOG('Gmail: page OK', pageUrl, 'rows', scraped.contacts.length, diag);
      }
    }

    const mergedRows = Array.from(byEmail.values()).filter((r) => r.email);
    if (mergedRows.length === 0) {
      platformStatus.gmail = {
        success: false,
        error:
          scrapeErrors.length > 0
            ? `No Google Contacts imported. ${scrapeErrors.join(' ')} Sign in at contacts.google.com.`
            : 'No contacts found. Open contacts.google.com in this profile and ensure lists load.',
      };
      return;
    }

    await processGmailContacts(mergedRows);
    platformStatus.gmail = { success: true };
    if (scrapeErrors.length > 0) {
      LOG('Gmail: imported', mergedRows.length, 'unique emails; some pages failed:', scrapeErrors);
    } else {
      LOG('Gmail: imported', mergedRows.length, 'unique emails');
    }
  } catch (e) {
    platformStatus.gmail = { success: false, error: e?.message || 'Gmail sync failed' };
    LOG('Gmail: sync failed', e?.message || e);
  }
}

async function syncWhatsApp(platformStatus) {
  try {
    // Try in-memory store access first (no DOM scraping, no virtualized-list scroll
    // limits — it's the full chat collection). Falls back to DOM scraping if the
    // store can't be accessed.
    LOG('WhatsApp: listing chats via in-memory store');
    let scraped = await scrapeWhatsAppChatListViaStoreInBackgroundTab({ log: LOG });
    if (!scraped?.success || !Array.isArray(scraped.chats) || scraped.chats.length === 0) {
      LOG('WhatsApp: store chat list failed or empty, falling back to DOM scrape:', scraped?.error, scraped?.storeDiag);
      scraped = await scrapeWhatsAppConversationListViaBackgroundTab(WHATSAPP_WEB_URL, { log: LOG });
    }
    const waDiag = scraped?.waScrapeDiag;
    if (!scraped?.success || !Array.isArray(scraped.chats)) {
      LOG('WhatsApp: scrape failed or no chat array', scraped?.error, waDiag);
      platformStatus.whatsapp = {
        success: false,
        error: scraped?.error || 'Could not load WhatsApp conversations. Sign in at web.whatsapp.com.',
      };
      return;
    }
    const directChats = scraped.chats.filter((c) => c?.name && c?.chatKey);
    if (directChats.length === 0) {
      LOG('WhatsApp: 0 chats after filter name/chatKey', waDiag);
      platformStatus.whatsapp = {
        success: false,
        error: 'No one-to-one WhatsApp chats found.',
      };
      return;
    }
    LOG('WhatsApp: importing scraped 1:1 chats (markup rules, no AI filter)', directChats.length);
    await processWhatsAppConnections(directChats);
    platformStatus.whatsapp = { success: true };
    LOG('WhatsApp: imported direct chats', directChats.length);
  } catch (e) {
    platformStatus.whatsapp = { success: false, error: e?.message || 'WhatsApp sync failed' };
    LOG('WhatsApp: sync failed', e?.message || e);
  }
}

/**
 * Dedupe key aligned with `normalizeLinkedInProfileUrl` + dedup.js (www/protocol/query stripped).
 * @param {string} url
 */
function linkedInProfileUrlDedupeKey(url) {
  const n = normalizeLinkedInProfileUrl(url || '');
  if (!n || !n.includes('/in/')) return '';
  return n.toLowerCase();
}
