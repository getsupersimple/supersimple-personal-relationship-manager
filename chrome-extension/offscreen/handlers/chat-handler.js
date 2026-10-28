import { GENERAL_ASSISTANT_PROMPT, CONTACT_RELEVANCE_PROMPT, CONTACT_ANSWER_PROMPT, PARSE_FACTOIDS_PROMPT } from '../prompts.js';
import { providerContext, localLlmConfigError, runChatCompletion as runLlm } from '../llm-client.js';
import { conversationSummaryPlatformLabel } from '../../lib/conversation-summary-display.js';
import { handleWebllmParseFactoids } from './parse-factoids-handler.js';

const MAX_HISTORY_TURNS = 20;

/**
 * Plain-text rendering of the exact messages array sent to the model, for the Ask AI page's
 * "full prompt" debug view — lets the user see precisely what's being sent (system scaffold,
 * contact context, history, current message), not an approximation of it.
 * @param {Array<{ role: string, content: string }>} messages
 */
function formatMessagesForDebug(messages) {
  return messages.map((m) => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n');
}

/**
 * Inverse of formatMessagesForDebug — parses a hand-edited "full prompt" textarea back into a
 * messages array, for the Ask AI page's editable prompt-override feature. Splits on blank lines
 * immediately followed by a "[ROLE]" marker, so edits WITHIN a section's own content (including
 * blank lines there) round-trip fine; only inserting/removing "[ROLE]" section markers changes
 * the resulting message count.
 *
 * Falls back to treating the whole text as a single user message if it contains no recognizable
 * "[ROLE]" tags at all — someone editing this box may not realize (or may not care) that it's
 * internally tag-formatted; the point of a raw prompt override is to let them send whatever they
 * typed, not to silently refuse it for missing formatting they never agreed to preserve.
 * @param {string} text
 * @returns {Array<{ role: string, content: string }>}
 */
function parseMessagesFromFullPromptText(text) {
  const trimmed = String(text || '').trim();
  const parts = trimmed.split(/\n\n(?=\[(?:SYSTEM|USER|ASSISTANT)\]\n)/);
  const messages = [];
  for (const part of parts) {
    const m = part.match(/^\[(SYSTEM|USER|ASSISTANT)\]\n([\s\S]*)$/);
    if (m) messages.push({ role: m[1].toLowerCase(), content: m[2] });
  }
  if (messages.length === 0 && trimmed) return [{ role: 'user', content: trimmed }];
  return messages;
}

/**
 * @param {unknown} history
 * @returns {Array<{ role: 'user' | 'assistant', content: string }>}
 */
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 4000) }));
}

/**
 * One Ask AI pass: a completion on the selected provider (see llm-client.js), trimmed and capped for display.
 * @param {Array<{role: string, content: string}>} messages
 * @param {ReturnType<typeof providerContext> & { maxTokens?: number }} ctx
 * @param {(...args: unknown[]) => void} log
 * @returns {Promise<{ ok: true, text: string } | { ok: false, error: string }>}
 */
async function runChatCompletion(messages, ctx, log) {
  const res = await runLlm(messages, ctx, { temperature: 0.3, maxTokens: ctx.maxTokens ?? 512 }, log);
  return res.ok ? { ok: true, text: res.text.trim().slice(0, 4000) } : res;
}

/** Canonical field id for a conversation summary, e.g. "linkedin_conversation". */
function conversationFieldId(platform) {
  return `${String(platform || '').toLowerCase()}_conversation`;
}

/** Case/whitespace/underscore-insensitive normalization for matching a small model's (possibly imprecise) field-name output back to a real field id. */
function normalizeFieldToken(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

/**
 * @param {Array<{key?: string, value?: string}>} factoids
 * @param {Array<{platform?: string, summary?: string}>} conversations
 * @returns {string[]}
 */
function buildAvailableFields(factoids, conversations) {
  const factoidFields = (factoids || []).filter((f) => f?.key && f?.value).map((f) => f.key);
  const conversationFields = (conversations || []).filter((c) => c?.summary).map((c) => conversationFieldId(c.platform));
  return [...factoidFields, ...conversationFields];
}

/**
 * @param {string} contactName
 * @param {Array<{key?: string, value?: string}>} factoids
 * @param {Array<{platform?: string, when?: string, summary?: string, isMostRecent?: boolean}>} conversations
 */
function buildKnownInformationBlock(contactName, factoids, conversations) {
  const lines = [`Contact: ${contactName}`];
  for (const f of factoids || []) {
    if (f?.key && f?.value) lines.push(`${f.key}: ${f.value}`);
  }
  for (const c of conversations || []) {
    if (!c?.summary) continue;
    const recencyNote = c.isMostRecent ? ' (most recent across all networks)' : '';
    lines.push(`${conversationSummaryPlatformLabel(c.platform)} conversation, last message ${c.when}${recencyNote}: ${c.summary}`);
  }
  return lines.join('\n');
}

/**
 * @param {Array<{key?: string, value?: string}>} factoids
 * @param {Array<{platform?: string, summary?: string}>} conversations
 * @param {string[]} neededFieldIds
 */
function filterKnownInformation(factoids, conversations, neededFieldIds) {
  const neededNorm = new Set(neededFieldIds.map(normalizeFieldToken));
  return {
    filteredFactoids: (factoids || []).filter((f) => f?.key && neededNorm.has(normalizeFieldToken(f.key))),
    filteredConversations: (conversations || []).filter(
      (c) => c?.summary && neededNorm.has(normalizeFieldToken(conversationFieldId(c.platform))),
    ),
  };
}

/**
 * Build pass 2's (answer) messages array + debug text for a given factoids/conversations set.
 * Factored out so it can be called twice: once with the full, unfiltered set for an early "Full
 * prompt" broadcast (before pass 1 — see handleWebllmChat), and once with pass 1's filtered result
 * for the real messages actually sent to the model.
 * @param {string} contactName
 * @param {Array<{key?: string, value?: string}>} factoids
 * @param {Array<{platform?: string, when?: string, summary?: string, isMostRecent?: boolean}>} conversations
 * @param {unknown} history
 * @param {string} content
 */
function buildAnswerMessages(contactName, factoids, conversations, history, content) {
  const block = buildKnownInformationBlock(contactName, factoids, conversations);
  const answerSystemPrompt = `${GENERAL_ASSISTANT_PROMPT}

${CONTACT_ANSWER_PROMPT}

KNOWN INFORMATION about ${contactName}
<known_information>
${block}
</known_information>`;
  const messages = [{ role: 'system', content: answerSystemPrompt }, ...sanitizeHistory(history), { role: 'user', content }];
  return { messages, fullPrompt: formatMessagesForDebug(messages) };
}

/**
 * Ask AI multi-pass flow, pass 1: figure out which of the available fields are actually needed to
 * answer the current question, so pass 2 only ever sees relevant data. See CONTACT_RELEVANCE_PROMPT
 * in prompts.js for the full rationale and the real bug this is meant to prevent.
 *
 * Falls back to 'ALL' (no filtering) on any parse failure, model error, or empty result — under-
 * including a needed field (a confident false "not on file") would be a worse failure than the
 * noisy-context problem this pass exists to fix in the first place.
 *
 * Returns the prompt text alongside the result (rather than just the result) so the caller can
 * show this pass in the Ask AI page's full call log — every prompt sent and every reply received,
 * not just the final answer. Calls `onPromptReady(prompt)`, if given, as soon as the prompt is
 * built — before the (potentially slow) model call itself — so the caller can broadcast it to the
 * Ask AI page right away instead of waiting for this whole pass to resolve.
 * @param {string} question
 * @param {string[]} availableFields
 * @param {object} providerCtx
 * @param {(...args: unknown[]) => void} log
 * @param {(prompt: string) => void} [onPromptReady]
 * @returns {Promise<{ result: string[] | 'ALL', prompt: string, reply: string }>}
 */
async function determineNeededFields(question, availableFields, providerCtx, log, onPromptReady) {
  const messages = [
    { role: 'system', content: CONTACT_RELEVANCE_PROMPT },
    { role: 'user', content: `AVAILABLE: ${availableFields.join(', ')}\nQUESTION: ${question}` },
  ];
  const prompt = formatMessagesForDebug(messages);
  if (onPromptReady) onPromptReady(prompt);
  if (availableFields.length === 0) return { result: 'ALL', prompt, reply: '(skipped — no fields available)' };
  const res = await runChatCompletion(messages, { ...providerCtx, maxTokens: 200 }, log);
  if (!res.ok) {
    log('determineNeededFields: pass failed, falling back to ALL:', res.error);
    return { result: 'ALL', prompt, reply: `(error: ${res.error})` };
  }
  const match = res.text.match(/\[[\s\S]*\]/);
  if (!match) {
    log('determineNeededFields: no JSON array in output, falling back to ALL:', res.text.slice(0, 200));
    return { result: 'ALL', prompt, reply: res.text };
  }
  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    log('determineNeededFields: JSON parse failed, falling back to ALL:', res.text.slice(0, 200));
    return { result: 'ALL', prompt, reply: res.text };
  }
  const fields = Array.isArray(parsed) ? parsed.filter((f) => typeof f === 'string') : [];
  const result = fields.length === 0 || fields.some((f) => normalizeFieldToken(f) === 'all') ? 'ALL' : fields;
  return { result, prompt, reply: res.text };
}

/** Same mechanical question-detection rule the old combined prompt used (see prompts.js history) — a message ending in "?" or starting with a question word is never a stated fact, so extraction is skipped for it entirely. */
const QUESTION_START_RE = /^(does|is|are|has|have|who|what|where|when|why|how)\b/i;
function looksLikePureQuestion(text) {
  const t = String(text || '').trim();
  return t.endsWith('?') || QUESTION_START_RE.test(t);
}

/**
 * Handle WEBLLM_CHAT action.
 * @param {{ prompt?: string, modelId?: string, history?: Array<{role: string, content: string}>, contactName?: string, factoids?: Array<{key: string, value: string}>, conversations?: Array<{platform: string, when: string, summary: string, isMostRecent: boolean}>, localLlmBaseUrl?: string, localLlmModel?: string, localLlmApiKey?: string, previewOnly?: boolean, overrideFullPrompt?: string }} msg
 * @param {( ...args: unknown[]) => void} log
 */
export async function handleWebllmChat(msg, log = () => {}) {
  const { prompt, modelId, history, contactName, factoids, conversations, localLlmBaseUrl, localLlmModel, localLlmApiKey, previewOnly, overrideFullPrompt } = msg;
  const providerCtx = providerContext(msg);
  const configError = localLlmConfigError(providerCtx);
  log('WEBLLM_CHAT: model=', providerCtx.selectedModel, '| provider=', providerCtx.provider, '| previewOnly=', !!previewOnly);

  // Every prompt actually sent this turn and its reply, in the order they happened — broadcast
  // progressively (a pending entry with reply:null as each call starts, filled in once it
  // resolves) so the Ask AI page's per-turn debug view can show the whole multi-pass sequence
  // live, not just the final answer's prompt. `calls` on the final return is the same array.
  const calls = [];
  function broadcastCalls() {
    chrome.runtime.sendMessage({ type: 'WEBLLM_PROMPT_PREVIEW', calls: [...calls] }).catch(() => {});
  }

  // A hand-edited "full prompt" from the Ask AI page's editable preview box replaces the whole
  // assembled messages array wholesale — the user is deliberately overriding what gets sent, so
  // this always skips the multi-pass flow entirely and sends exactly what they typed as one call.
  if (typeof overrideFullPrompt === 'string' && overrideFullPrompt.trim()) {
    const messages = parseMessagesFromFullPromptText(overrideFullPrompt);
    const fullPrompt = overrideFullPrompt;
    if (previewOnly) return { fullPrompt, preview: true };
    if (configError) return { error: configError };
    calls.push({ label: 'Answer (hand-edited override)', prompt: fullPrompt, reply: null });
    broadcastCalls();
    const res = await runChatCompletion(messages, providerCtx, log);
    calls[0].reply = res.ok ? res.text : `(error: ${res.error})`;
    broadcastCalls();
    if (!res.ok) return { error: res.error, fullPrompt, calls };
    return { answer: res.text, fullPrompt, calls };
  }

  const content = (prompt || '').trim().slice(0, 4000);
  if (!content) return { error: 'No prompt provided' };
  if (configError) return { error: configError };

  const hasContact = typeof contactName === 'string' && contactName.trim();
  if (!hasContact) {
    // Generic chat — no contact context to filter, so there's nothing for a relevance pass to do.
    const messages = [{ role: 'system', content: GENERAL_ASSISTANT_PROMPT }, ...sanitizeHistory(history), { role: 'user', content }];
    const fullPrompt = formatMessagesForDebug(messages);
    if (previewOnly) return { fullPrompt, preview: true };
    calls.push({ label: 'Answer', prompt: fullPrompt, reply: null });
    broadcastCalls();
    const res = await runChatCompletion(messages, providerCtx, log);
    calls[0].reply = res.ok ? res.text : `(error: ${res.error})`;
    broadcastCalls();
    if (!res.ok) return { error: res.error, fullPrompt, calls };
    return { answer: res.text, fullPrompt, calls };
  }

  // --- Contact-focused: multi-pass (relevance -> answer -> extraction) ---
  const allFactoids = Array.isArray(factoids) ? factoids : [];
  const allConversations = Array.isArray(conversations) ? conversations : [];
  const availableFields = buildAvailableFields(allFactoids, allConversations);

  if (previewOnly) {
    const { fullPrompt } = buildAnswerMessages(contactName, allFactoids, allConversations, history, content);
    return {
      fullPrompt: `${fullPrompt}\n\n[NOTE: at send time, a relevance pass first narrows KNOWN INFORMATION down to only the fields this question actually needs — this preview shows the full unfiltered set, since that pass itself requires a real model call.]`,
      preview: true,
    };
  }

  // Pass 1: relevance — broadcast as soon as its prompt is known (pending reply), then fill in
  // the reply once it resolves, so this shows up live instead of only appearing after the whole
  // turn (including the later answer/extraction calls) finishes.
  calls.push({ label: 'Pass 1: Relevance', prompt: null, reply: null });
  const relevanceIdx = calls.length - 1;
  const { result: neededFields, reply: relevanceReply } = await determineNeededFields(
    content,
    availableFields,
    providerCtx,
    log,
    (prompt) => {
      calls[relevanceIdx].prompt = prompt;
      broadcastCalls();
    },
  );
  calls[relevanceIdx].reply = relevanceReply;
  broadcastCalls();

  const { filteredFactoids, filteredConversations } =
    neededFields === 'ALL' ? { filteredFactoids: allFactoids, filteredConversations: allConversations } : filterKnownInformation(allFactoids, allConversations, neededFields);
  const { messages, fullPrompt } = buildAnswerMessages(contactName, filteredFactoids, filteredConversations, history, content);

  // Pass 2: answer.
  calls.push({ label: 'Pass 2: Answer', prompt: fullPrompt, reply: null });
  const answerIdx = calls.length - 1;
  broadcastCalls();
  const res = await runChatCompletion(messages, providerCtx, log);
  calls[answerIdx].reply = res.ok ? res.text : `(error: ${res.error})`;
  broadcastCalls();
  if (!res.ok) return { error: res.error, fullPrompt, calls };

  // Pass 3: extraction — its own dedicated pass, reusing the already-proven PARSE_FACTOIDS_PROMPT/
  // handleWebllmParseFactoids directly (a plain in-process function call, not a second message
  // round-trip) instead of re-implementing fact-extraction inline in the answer prompt — the whole
  // point of splitting this out is to stop asking one completion to do two different jobs. Skipped
  // for a pure question (nothing to extract) using the same mechanical rule the old combined
  // prompt used — and no call to log in that case, since none was made.
  let extractedFactoids = null;
  if (!looksLikePureQuestion(content)) {
    const extractionPrompt = formatMessagesForDebug([
      { role: 'system', content: PARSE_FACTOIDS_PROMPT },
      { role: 'user', content },
    ]);
    calls.push({ label: 'Pass 3: Extract facts', prompt: extractionPrompt, reply: null });
    const extractIdx = calls.length - 1;
    broadcastCalls();
    try {
      const parseRes = await handleWebllmParseFactoids(
        { text: content, modelId, localLlmBaseUrl, localLlmModel, localLlmApiKey },
        log,
      );
      extractedFactoids = parseRes?.factoids || null;
      calls[extractIdx].reply = parseRes?.rawOutput || JSON.stringify(extractedFactoids ?? []);
    } catch (e) {
      log('handleWebllmChat: factoid extraction failed (non-fatal):', e?.message || e);
      calls[extractIdx].reply = `(error: ${e?.message || e})`;
    }
    broadcastCalls();
  }

  return { answer: res.text, fullPrompt, extractedFactoids, calls };
}
