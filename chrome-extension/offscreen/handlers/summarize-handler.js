import {
  SINGLE_MESSAGE_SUMMARY_PROMPT,
  RECENT_THREAD_SUMMARY_PROMPT,
  withUserNameContext,
} from '../prompts.js';
import { providerContext, localLlmConfigError, runChatCompletion } from '../llm-client.js';

/**
 * Handle WEBLLM_SUMMARIZE_MESSAGE action.
 * @param {{ text?: string, modelId?: string, summaryVariant?: 'recent_thread'|'facebook_recent_thread', userName?: string, localLlmBaseUrl?: string, localLlmModel?: string, localLlmApiKey?: string }} msg
 * @param {( ...args: unknown[]) => void} log
 */
export async function handleWebllmSummarizeMessage(msg, log = () => {}) {
  const ctx = providerContext(msg);
  log('WEBLLM_SUMMARIZE_MESSAGE: model=', ctx.selectedModel, '| provider=', ctx.provider);

  const isRecentThread =
    msg.summaryVariant === 'recent_thread' || msg.summaryVariant === 'facebook_recent_thread';
  const basePrompt = isRecentThread ? RECENT_THREAD_SUMMARY_PROMPT : SINGLE_MESSAGE_SUMMARY_PROMPT;
  const systemPrompt = withUserNameContext(basePrompt, msg.userName);
  const maxIn = isRecentThread ? 8000 : 2000;
  const maxOut = isRecentThread ? 220 : 150;
  const content = (msg.text || '').trim().slice(0, maxIn);
  if (!content) return { error: 'No text provided' };
  const configError = localLlmConfigError(ctx);
  if (configError) return { error: configError };

  const res = await runChatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
    ctx,
    { temperature: 0.2, maxTokens: maxOut },
    log,
  );
  if (!res.ok) return { error: res.error };
  return { summary: res.text.trim().slice(0, 500) };
}
