/**
 * @param {string} baseUrl - e.g. 'https://your-server/v1'
 */
function resolveChatCompletionsUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

/**
 * Call an OpenAI-compatible Chat Completions endpoint on a server the user configured (Ollama, LM Studio,
 * llama.cpp, vLLM, or OpenAI itself if the user enters its URL) and return text output.
 * There is no built-in default host: with no `baseUrl` nothing is sent anywhere. `apiKey` is optional.
 * @param {{
 *   apiKey?: string,
 *   messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }>,
 *   temperature?: number,
 *   maxTokens?: number,
 *   model?: string,
 *   baseUrl?: string,
 * }} args
 * @returns {Promise<{ ok: true, text: string } | { ok: false, error: string, status?: number, details?: string }>}
 */
export async function openaiChatCompletion({
  apiKey,
  messages,
  temperature = 0.2,
  maxTokens = 256,
  model,
  baseUrl,
}) {
  if (!String(baseUrl || '').trim()) {
    return { ok: false, error: 'No LLM server configured. Enter your server\'s base URL in Settings.' };
  }
  if (!String(model || '').trim()) {
    return { ok: false, error: 'No model name configured for your LLM server. Enter it in Settings.' };
  }
  const key = String(apiKey || '').trim();
  const url = resolveChatCompletionsUrl(baseUrl);
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  let resp;
  try {
    resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    return {
      ok: false,
      error: `Could not reach local LLM server at ${url}. Check the base URL and that the server is running.`,
      details: e?.message,
    };
  }

  if (!resp.ok) {
    let details = '';
    try {
      details = await resp.text();
    } catch (_) {
      // ignore
    }
    return {
      ok: false,
      error: 'Local LLM request failed. Check the base URL, model name, and that the server is running.',
      status: resp.status,
      details,
    };
  }

  const data = await resp.json();
  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  return { ok: true, text };
}
