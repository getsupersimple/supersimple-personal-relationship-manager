/**
 * The one place that runs a chat completion against the selected provider: an in-browser WebLLM model, or the
 * user's own OpenAI-compatible server (Local LLM). Used by the chat, factoid-parse and summarize handlers.
 */
import { LOCAL_LLM_MODEL_ID, DEFAULT_MODEL } from './constants.js';
import { ensureEngine } from './mlc-engine.js';
import { openaiChatCompletion } from './openai-client.js';

export const LOCAL_LLM_CONFIG_ERROR = 'Local LLM base URL and model name are required. Configure them in Settings.';

/**
 * Which provider a request uses and the Local LLM settings that came with it.
 * @param {{ modelId?: string, localLlmBaseUrl?: string, localLlmModel?: string, localLlmApiKey?: string }} msg
 */
export function providerContext(msg) {
  const selectedModel = msg.modelId || DEFAULT_MODEL;
  const isLocalLlm = selectedModel === LOCAL_LLM_MODEL_ID;
  return {
    selectedModel,
    isLocalLlm,
    provider: isLocalLlm ? 'local-llm' : 'webllm',
    localLlmBaseUrl: msg.localLlmBaseUrl,
    localLlmModel: msg.localLlmModel,
    localLlmApiKey: msg.localLlmApiKey,
  };
}

/** @returns {string | null} an error message when Local LLM is selected but its server or model is not set */
export function localLlmConfigError(ctx) {
  return ctx.isLocalLlm && (!ctx.localLlmBaseUrl || !ctx.localLlmModel) ? LOCAL_LLM_CONFIG_ERROR : null;
}

/**
 * Run one chat completion. Returns the model's text untouched; callers trim or cap it as they need.
 * A WebLLM engine failure throws (model download or GPU problem); a Local LLM failure returns { ok: false }.
 * @param {Array<{role: string, content: string}>} messages
 * @param {ReturnType<typeof providerContext>} ctx
 * @param {{ temperature?: number, maxTokens?: number }} [options]
 * @param {(...args: unknown[]) => void} [log]
 * @returns {Promise<{ ok: true, text: string } | { ok: false, error: string }>}
 */
export async function runChatCompletion(messages, ctx, { temperature = 0.3, maxTokens = 512 } = {}, log = () => {}) {
  if (ctx.isLocalLlm) {
    const res = await openaiChatCompletion({
      apiKey: ctx.localLlmApiKey,
      baseUrl: ctx.localLlmBaseUrl,
      model: ctx.localLlmModel,
      messages,
      temperature,
      maxTokens,
    });
    if (!res.ok) {
      log('Local LLM error status:', res.status, (res.details || '').slice(0, 200));
      return { ok: false, error: res.error };
    }
    return { ok: true, text: String(res.text || '') };
  }
  const eng = await ensureEngine(ctx.selectedModel);
  const reply = await eng.chat.completions.create({ messages, temperature, max_tokens: maxTokens });
  let text = '';
  if (typeof reply === 'object' && reply.choices?.[0]?.message?.content) text = reply.choices[0].message.content;
  else if (typeof reply === 'string') text = reply;
  return { ok: true, text };
}
