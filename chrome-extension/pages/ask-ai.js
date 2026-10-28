import { initModelDownloadBanner } from '../lib/model-download-banner.js';
import { initWebLLMModelSelect } from '../lib/webllm-model-select.js';
import { storage } from '../lib/storage.js';
import { describeContactForDisambiguation } from '../lib/contact-mention-resolver.js';

// Generous — this is a cheap in-memory filter (no factoid fetches, no model calls, unlike the
// disambiguation-message cap), and the dropdown itself scrolls, so there's no real reason to cap
// this tightly the way the text-based disambiguation cap had to.
const MAX_MENTION_SUGGESTIONS = 50;

// Session-only conversation state — resets on page reload. The server (background service
// worker) is stateless between requests; this page owns and resends the state each turn.
/** @type {Array<{ role: 'user' | 'assistant', content: string }>} */
let history = [];
let focusedContactId = null;
let pendingDisambiguation = null;

document.addEventListener('DOMContentLoaded', async () => {
  const modelSelectEl = document.getElementById('askAiModelSelect');
  const promptEl = document.getElementById('askAiPrompt');
  const transcriptEl = document.getElementById('askAiTranscript');
  const focusedContactEl = document.getElementById('askAiFocusedContact');
  const statusEl = document.getElementById('askAiStatus');
  const previewTextEl = document.getElementById('askAiPromptPreviewText');
  const previewResetLinkEl = document.getElementById('askAiPromptPreviewReset');
  const sendBtn = document.getElementById('askAiSendBtn');
  const resetBtn = document.getElementById('askAiResetBtn');
  const mentionDropdownEl = document.getElementById('askAiMentionDropdown');

  promptEl.focus();

  // @-mention autocomplete: typing "@" starts a live search over ALL contacts (not the deterministic
  // name-token matching sw.js uses for disambiguation, which is a much looser substring match here
  // since the user is picking directly off a list, not typing free text). Selecting one tracks its
  // exact contact id (mentionedContactId) to send alongside the prompt — sw.js uses it to set
  // focusedContactId directly, skipping name resolution entirely, so it can't be ambiguous no
  // matter how many contacts share that name (unlike typing the name and hoping it resolves).
  let contactsCache = null;
  let mentionedContactId = null;
  let mentionRange = null; // { start, end } in promptEl.value covering the "@query" being typed
  let mentionCandidates = [];
  let mentionHighlightIndex = 0;

  async function ensureContactsCache() {
    if (!contactsCache) contactsCache = await storage.getAllContacts();
    return contactsCache;
  }

  function closeMentionDropdown() {
    mentionDropdownEl.classList.add('hidden');
    mentionDropdownEl.innerHTML = '';
    mentionCandidates = [];
    mentionRange = null;
  }

  // Builds the dropdown's DOM once per candidate-list change (typing, not arrow-key nav) — arrow
  // keys only move the highlight (updateMentionHighlight), not rebuild the list, since rebuilding
  // via innerHTML on every keypress was resetting the container's scroll position back to the top
  // every time, making it impossible to arrow past whatever fit in the visible area.
  function renderMentionDropdown() {
    mentionDropdownEl.innerHTML = '';
    if (mentionCandidates.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ask-ai-mention-empty';
      empty.textContent = 'No matching contacts';
      mentionDropdownEl.appendChild(empty);
      mentionDropdownEl.classList.remove('hidden');
      return;
    }
    mentionCandidates.forEach((contact) => {
      const li = document.createElement('li');
      li.className = 'ask-ai-mention-item';
      li.setAttribute('role', 'option');
      li.textContent = describeContactForDisambiguation(contact, []);
      // mousedown (not click) fires before the input's blur, so selection doesn't get lost.
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectMention(contact);
      });
      mentionDropdownEl.appendChild(li);
    });
    mentionDropdownEl.classList.remove('hidden');
    updateMentionHighlight();
  }

  // Moves which item is marked active and scrolls it into view — cheap (no DOM rebuild), so it's
  // safe to call on every arrow-key press without disturbing scroll position elsewhere.
  function updateMentionHighlight() {
    const items = mentionDropdownEl.querySelectorAll('.ask-ai-mention-item');
    items.forEach((li, idx) => li.classList.toggle('active', idx === mentionHighlightIndex));
    const activeEl = items[mentionHighlightIndex];
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  /** Finds the "@query" token the cursor is currently inside, if any — an "@" reachable from the
   * cursor, not itself preceded by a non-whitespace character (so "email@x" doesn't trigger).
   * Contact names are frequently multi-word ("Alex Schleifer"), so a single space doesn't end the
   * query — otherwise typing a first name, then a space to narrow by last name, would silently
   * close the dropdown right when it's most useful. Still bails out on a clear "moved on" signal
   * (two spaces in a row) or after too many words to be a plausible name, so it doesn't scan back
   * across an entire unrelated sentence looking for a stray "@". */
  function getActiveMentionRange() {
    const value = promptEl.value;
    const cursor = promptEl.selectionStart ?? value.length;
    let consecutiveSpaces = 0;
    let sawSpaceBefore = false;
    let wordCount = 0;
    for (let i = cursor - 1; i >= 0; i--) {
      const ch = value[i];
      if (ch === '@') {
        const prevCh = i > 0 ? value[i - 1] : '';
        if (prevCh && !/\s/.test(prevCh)) return null;
        return { start: i, end: cursor, query: value.slice(i + 1, cursor) };
      }
      if (/\s/.test(ch)) {
        consecutiveSpaces++;
        if (consecutiveSpaces >= 2) return null;
        if (!sawSpaceBefore) {
          wordCount++;
          if (wordCount > 4) return null;
        }
        sawSpaceBefore = true;
      } else {
        consecutiveSpaces = 0;
        sawSpaceBefore = false;
      }
    }
    return null;
  }

  /** Lowercased, punctuation-stripped words — so "Christian (Chris) Bach" tokenizes to
   * ["christian", "chris", "bach"] rather than treating the parentheses as part of the name. */
  function tokenizeForMentionSearch(text) {
    return String(text || '')
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]+/gu, ''))
      .filter(Boolean);
  }

  /** Every query token must PREFIX-match some token in the contact's name (in any order) — not a
   * single contiguous substring of the raw display name. A raw substring match fails on
   * "Christian (Chris) Bach" for the query "chris bach", since "(Chris) " sits between them in the
   * actual string; token matching finds "chris" and "bach" as separate name tokens instead.
   * Prefix (not exact) matching keeps partial typing working, e.g. "chr" still matches "christian".
   */
  function contactMatchesMentionQuery(contact, queryTokens) {
    if (queryTokens.length === 0) return true;
    const nameTokens = tokenizeForMentionSearch(contact.displayName);
    return queryTokens.every((qt) => nameTokens.some((nt) => nt.startsWith(qt)));
  }

  async function updateMentionDropdown() {
    const range = getActiveMentionRange();
    if (!range) {
      closeMentionDropdown();
      return;
    }
    mentionRange = range;
    const contacts = await ensureContactsCache();
    // Re-check: input may have changed (or the mention token disappeared) while awaiting the cache.
    const stillActive = getActiveMentionRange();
    if (!stillActive || stillActive.start !== range.start) return;
    const queryTokens = tokenizeForMentionSearch(range.query);
    const filtered = queryTokens.length === 0 ? contacts : contacts.filter((c) => contactMatchesMentionQuery(c, queryTokens));
    mentionCandidates = filtered.slice(0, MAX_MENTION_SUGGESTIONS);
    mentionHighlightIndex = 0;
    renderMentionDropdown();
  }

  function selectMention(contact) {
    if (!mentionRange) return;
    const { start, end } = mentionRange;
    const value = promptEl.value;
    const insertText = `${contact.displayName} `;
    promptEl.value = value.slice(0, start) + insertText + value.slice(end);
    const newCursor = start + insertText.length;
    promptEl.setSelectionRange(newCursor, newCursor);
    mentionedContactId = contact.id;
    closeMentionDropdown();
    promptEl.focus();
    // Re-run the normal input handling (live preview regeneration) for the text change.
    promptEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  promptEl.addEventListener('input', () => {
    void updateMentionDropdown();
  });

  // Reposition/close relative to click-away; simplest reliable trigger is blur, but blur fires
  // before a dropdown mousedown's preventDefault would help — mousedown-based selection above
  // already handles that case, so blur here only needs to cover genuinely clicking elsewhere.
  promptEl.addEventListener('blur', () => {
    setTimeout(() => closeMentionDropdown(), 100);
  });

  // Live "full prompt" preview, built without calling the model (previewOnly) so it can update on
  // every keystroke cheaply. lastGeneratedFullPrompt tracks what was last auto-filled, so a hand
  // edit to the textarea (which then differs from it) is detected and never silently overwritten.
  let lastGeneratedFullPrompt = '';
  let previewRequestId = 0;
  let previewDebounceTimer = null;

  function isPreviewEdited() {
    return previewTextEl.value !== lastGeneratedFullPrompt;
  }

  function clearPreview() {
    previewTextEl.value = '';
    lastGeneratedFullPrompt = '';
    previewResetLinkEl.classList.add('hidden');
  }

  async function regeneratePreview(text) {
    const requestId = ++previewRequestId;
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'ASK_AI_CHAT', prompt: text, history, focusedContactId, pendingDisambiguation, previewOnly: true, mentionedContactId },
        (response) => resolve(response || {}),
      );
    });
    // Superseded by a newer keystroke's preview request, or by an actual send, while this was in flight.
    if (requestId !== previewRequestId) return;
    lastGeneratedFullPrompt =
      res.fullPrompt || '(no prompt would be sent for this — it would ask for clarification, or answer without calling the model)';
    previewTextEl.value = lastGeneratedFullPrompt;
    previewResetLinkEl.classList.add('hidden');
  }

  promptEl.addEventListener('input', () => {
    if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(() => {
      const text = (promptEl.value || '').trim();
      if (!text) {
        clearPreview();
        return;
      }
      // Don't clobber a hand edit the user is still making — they can use "Reset to generated".
      if (isPreviewEdited()) return;
      void regeneratePreview(text);
    }, 350);
  });

  previewTextEl.addEventListener('input', () => {
    previewResetLinkEl.classList.toggle('hidden', !isPreviewEdited());
  });

  previewResetLinkEl.addEventListener('click', (e) => {
    e.preventDefault();
    const text = (promptEl.value || '').trim();
    if (text) void regeneratePreview(text);
  });

  await initWebLLMModelSelect(modelSelectEl);

  initModelDownloadBanner();

  function appendTurn(role, text, { isError = false } = {}) {
    const el = document.createElement('div');
    el.className = `ask-ai-turn ask-ai-turn-${role}${isError ? ' ask-ai-turn-error' : ''}`;
    el.textContent = text;
    transcriptEl.appendChild(el);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    return el;
  }

  // Renders every prompt actually sent for this turn and its reply, in order — not just the
  // final answer's prompt. Each call arrives progressively via the WEBLLM_PROMPT_PREVIEW
  // broadcast (a pending entry with reply=null as it starts, filled in once it resolves), so
  // re-rendering on every update naturally shows the whole multi-pass sequence live.
  function renderCalls(container, calls) {
    container.innerHTML = '';
    if (!Array.isArray(calls) || calls.length === 0) {
      const pre = document.createElement('pre');
      pre.className = 'ask-ai-prompt-text';
      pre.textContent = 'Waiting for the first call…';
      container.appendChild(pre);
      return;
    }
    for (const call of calls) {
      const section = document.createElement('div');
      section.className = 'ask-ai-call';

      const heading = document.createElement('div');
      heading.className = 'ask-ai-call-heading';
      heading.textContent = call.label || 'Call';
      section.appendChild(heading);

      const promptPre = document.createElement('pre');
      promptPre.className = 'ask-ai-prompt-text';
      promptPre.textContent = call.prompt || '(building prompt…)';
      section.appendChild(promptPre);

      const replyHeading = document.createElement('div');
      replyHeading.className = 'ask-ai-call-heading';
      replyHeading.textContent = 'Reply';
      section.appendChild(replyHeading);

      const replyPre = document.createElement('pre');
      replyPre.className = 'ask-ai-prompt-text';
      replyPre.textContent = call.reply === null || call.reply === undefined ? 'Waiting…' : call.reply;
      section.appendChild(replyPre);

      container.appendChild(section);
    }
  }

  // One "Thinking…" indicator per user message, appended right after that message so it sits
  // between it and the eventual reply — and stays there, updated to "Thought for N seconds" once
  // that specific reply lands, rather than a single shared status shown only for the latest turn.
  function appendThinkingIndicator() {
    const statusSpan = document.createElement('span');
    statusSpan.className = 'ask-ai-thinking-status';
    statusSpan.textContent = 'Thinking…';

    const callsContainerEl = document.createElement('div');
    callsContainerEl.className = 'ask-ai-calls';
    renderCalls(callsContainerEl, []);

    // Visible immediately (not gated on the response landing) so it's available to expand while
    // still "Thinking…" — filled in with each pass's prompt/reply as they happen.
    const detailsEl = document.createElement('details');
    detailsEl.className = 'ask-ai-prompt-details';
    const summaryEl = document.createElement('summary');
    summaryEl.textContent = 'Full prompt';
    detailsEl.appendChild(summaryEl);
    detailsEl.appendChild(callsContainerEl);

    const container = document.createElement('div');
    container.className = 'ask-ai-thinking';
    container.appendChild(statusSpan);
    container.appendChild(detailsEl);
    transcriptEl.appendChild(container);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;

    return { statusSpan, detailsEl, callsContainerEl };
  }

  function updateFocusedContactIndicator(name) {
    if (name) {
      focusedContactEl.textContent = `Currently discussing: ${name}`;
      focusedContactEl.classList.remove('hidden');
    } else {
      focusedContactEl.textContent = '';
      focusedContactEl.classList.add('hidden');
    }
  }

  function resetConversation() {
    history = [];
    focusedContactId = null;
    pendingDisambiguation = null;
    mentionedContactId = null;
    closeMentionDropdown();
    transcriptEl.innerHTML = '';
    updateFocusedContactIndicator(null);
    statusEl.textContent = '';
    if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    previewRequestId++;
    clearPreview();
  }

  async function sendPrompt() {
    const prompt = (promptEl.value || '').trim();
    // A hand-edited preview box (differs from what was auto-generated for the current input)
    // replaces the whole prompt sent to the model — see chat-handler.js's overrideFullPrompt. It's
    // enough on its own to send: typing directly into the full-prompt box and leaving the plain
    // prompt input empty is a valid way to use this (e.g. hand-crafting a system prompt to test).
    const overrideFullPrompt = isPreviewEdited() && previewTextEl.value.trim() ? previewTextEl.value : '';
    if (!prompt && !overrideFullPrompt) {
      statusEl.textContent = 'Enter a prompt, or a full prompt override, first.';
      return;
    }
    // Captured now and reset after — a mention selected for THIS message shouldn't silently carry
    // over and get applied to an unrelated later one that never mentioned anyone.
    const mentionIdForThisTurn = mentionedContactId;
    mentionedContactId = null;
    closeMentionDropdown();
    if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    previewRequestId++; // invalidate any in-flight live preview for the now-stale input
    statusEl.textContent = '';
    appendTurn('user', prompt || '(sent via edited full prompt — see below)');
    promptEl.value = '';
    clearPreview();
    sendBtn.disabled = true;
    promptEl.disabled = true;
    const sendStartedAt = Date.now();
    const thinking = appendThinkingIndicator();

    // While waiting, a first-time (or model-switch) response may require loading the model — swap
    // "Thinking…" for its live progress instead of leaving a misleading static message. Uses
    // WebLLM's own progress text rather than a hardcoded "Downloading…" label, since that text
    // already distinguishes a real network fetch ("Fetching param cache...") from a fast local
    // cache read ("Loading model from cache...") — see mlc-engine.js. A previously-used model
    // switching back in is a cache read, not a re-download; showing "Downloading…" for both made
    // every model switch look like it was re-fetching from the network even when it wasn't.
    const showDownloadOrThinking = (downloadState) => {
      thinking.statusSpan.textContent = downloadState
        ? downloadState.text || `Loading model… ${Math.round((downloadState.progress || 0) * 100)}%`
        : 'Thinking…';
    };
    const onStorageChange = (changes, area) => {
      if (area !== 'local' || !('prmModelDownloadProgress' in changes)) return;
      showDownloadOrThinking(changes.prmModelDownloadProgress.newValue);
    };
    chrome.storage.onChanged.addListener(onStorageChange);

    // Broadcast from chat-handler.js as each pass's prompt is assembled and as each reply
    // arrives, before the whole turn completes — shows the full multi-pass sequence live,
    // updating in place, instead of only appearing after everything finishes.
    const onRuntimeMessage = (message) => {
      if (message?.type === 'WEBLLM_PROMPT_PREVIEW' && Array.isArray(message.calls)) {
        renderCalls(thinking.callsContainerEl, message.calls);
      }
    };
    chrome.runtime.onMessage.addListener(onRuntimeMessage);

    try {
      const { prmModelDownloadProgress } = await chrome.storage.local.get('prmModelDownloadProgress');
      if (prmModelDownloadProgress) showDownloadOrThinking(prmModelDownloadProgress);

      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'ASK_AI_CHAT', prompt, history, focusedContactId, pendingDisambiguation, overrideFullPrompt, mentionedContactId: mentionIdForThisTurn },
          (response) => resolve(response || { error: 'No response from AI' }),
        );
      });
      const thoughtSeconds = Math.max(1, Math.round((Date.now() - sendStartedAt) / 1000));
      thinking.statusSpan.textContent = `Thought for ${thoughtSeconds} second${thoughtSeconds === 1 ? '' : 's'}`;
      // calls is only present once at least one message actually reached the model —
      // deterministic responses like a disambiguation question (never calls the LLM) won't have
      // one; fall back to the single fullPrompt field (or a "no prompt sent" note) for those.
      if (Array.isArray(res.calls) && res.calls.length) {
        renderCalls(thinking.callsContainerEl, res.calls);
      } else {
        renderCalls(thinking.callsContainerEl, [
          { label: 'Answer', prompt: res.fullPrompt || '(no prompt sent — answered without calling the model)', reply: res.answer || res.error || '' },
        ]);
      }
      if (res.error) {
        appendTurn('assistant', res.error, { isError: true });
        return;
      }
      pendingDisambiguation = res.pendingDisambiguation || null;
      focusedContactId = res.focusedContactId || null;
      updateFocusedContactIndicator(res.focusedContactName || null);
      const answer = res.answer || '(no answer)';
      appendTurn('assistant', answer);
      history.push(
        { role: 'user', content: prompt || '(sent via edited full prompt)' },
        { role: 'assistant', content: answer },
      );
    } catch (e) {
      thinking.statusSpan.textContent = 'Something went wrong.';
      renderCalls(thinking.callsContainerEl, [{ label: 'Answer', prompt: '(no prompt sent — request failed)', reply: e?.message || 'Something went wrong.' }]);
      appendTurn('assistant', e?.message || 'Something went wrong.', { isError: true });
    } finally {
      chrome.storage.onChanged.removeListener(onStorageChange);
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      sendBtn.disabled = false;
      promptEl.disabled = false;
      promptEl.focus();
    }
  }

  sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    void sendPrompt();
  });

  resetBtn.addEventListener('click', (e) => {
    e.preventDefault();
    resetConversation();
  });

  promptEl.addEventListener('keydown', (e) => {
    const mentionOpen = !mentionDropdownEl.classList.contains('hidden') && mentionCandidates.length > 0;
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionHighlightIndex = (mentionHighlightIndex + 1) % mentionCandidates.length;
        updateMentionHighlight();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionHighlightIndex = (mentionHighlightIndex - 1 + mentionCandidates.length) % mentionCandidates.length;
        updateMentionHighlight();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(mentionCandidates[mentionHighlightIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMentionDropdown();
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void sendPrompt();
    }
  });
});
