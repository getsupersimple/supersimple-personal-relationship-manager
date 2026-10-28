import { PARSE_FACTOIDS_PROMPT } from '../prompts.js';
import { providerContext, localLlmConfigError, runChatCompletion } from '../llm-client.js';
import { parseFactoidsOutput } from '../factoids-parser.js';

/**
 * Handle WEBLLM_PARSE_FACTOIDS action. Returns the model's raw (pre-parse) output as `rawOutput`
 * alongside the parsed `factoids` — used by chat-handler.js's multi-pass Ask AI flow to show the
 * actual extraction-pass reply in the "Full prompt" debug view, not just its parsed result.
 * @param {{ text?: string, modelId?: string, localLlmBaseUrl?: string, localLlmModel?: string, localLlmApiKey?: string }} msg
 * @param {( ...args: unknown[]) => void} log
 */
export async function handleWebllmParseFactoids(msg, log = () => {}) {
  const ctx = providerContext(msg);
  log('Received WEBLLM_PARSE_FACTOIDS, text length:', msg.text?.length);
  log('WEBLLM_PARSE_FACTOIDS: model=', ctx.selectedModel, '| provider=', ctx.provider);

  const content = (msg.text || '').trim().slice(0, 500);
  if (!content) {
    return { error: 'No text provided' };
  }
  const configError = localLlmConfigError(ctx);
  if (configError) return { error: configError };

  const res = await runChatCompletion(
    [
      { role: 'system', content: PARSE_FACTOIDS_PROMPT },
      { role: 'user', content },
    ],
    ctx,
    { temperature: 0.1, maxTokens: 512 },
    log,
  );
  if (!res.ok) return { error: res.error };

  const rawOutput = res.text.slice(0, 2000);
  const parsed = parseFactoidsOutput(rawOutput, content);
  if (!parsed.ok) {
    log('Parse factoids raw output:', rawOutput.slice(0, 400));
    return { error: parsed.error, rawOutput };
  }
  log('Parsed factoids:', parsed.factoids.length, parsed.factoids);
  return { factoids: parsed.factoids, rawOutput };
}
