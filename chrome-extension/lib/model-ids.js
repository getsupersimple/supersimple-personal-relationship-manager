/**
 * The one place that names the model/provider choices. Imported by the service worker, the offscreen document
 * (via offscreen/constants.js) and the extension pages (copied to dist/lib by the build).
 */
export const DEFAULT_MODEL = 'gemma-2-2b-it-q4f16_1-MLC';

/** The user's own OpenAI-compatible server (Settings > Local LLM). */
export const LOCAL_LLM_MODEL_ID = 'local-openai';

/** Removed in 1.84.0 (ADR 0003); a saved value is migrated to DEFAULT_MODEL. */
export const REMOVED_CHATGPT_MODEL_ID = 'chatgpt';

/** Dropdown choices: curated WebLLM models (prebuiltAppConfig ids) plus the Local LLM option. */
export const MODEL_OPTIONS = Object.freeze([
  { label: 'Qwen 2.5 0.5B (fastest)', value: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' },
  { label: 'Qwen 2.5 1.5B', value: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' },
  { label: 'Qwen 2.5 3B', value: 'Qwen2.5-3B-Instruct-q4f16_1-MLC' },
  { label: 'Qwen 2.5 7B (stronger)', value: 'Qwen2.5-7B-Instruct-q4f16_1-MLC' },
  { label: 'Qwen 2 0.5B (legacy)', value: 'Qwen2-0.5B-Instruct-q4f16_1-MLC' },
  { label: 'Qwen 2 1.5B', value: 'Qwen2-1.5B-Instruct-q4f16_1-MLC' },
  { label: 'Qwen 2 7B', value: 'Qwen2-7B-Instruct-q4f16_1-MLC' },
  { label: 'Phi-3.5 mini ~3.8B', value: 'Phi-3.5-mini-instruct-q4f16_1-MLC' },
  { label: 'Mistral 7B', value: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC' },
  { label: 'Llama 3.2 3B', value: 'Llama-3.2-3B-Instruct-q4f16_1-MLC' },
  { label: 'Llama 3.1 8B', value: 'Llama-3.1-8B-Instruct-q4f16_1-MLC' },
  { label: 'Gemma 3 1B (fastest)', value: 'gemma3-1b-it-q4f16_1-MLC' },
  { label: 'Gemma 2 2B (default)', value: DEFAULT_MODEL },
  { label: 'Gemma 2 2B (Japanese)', value: 'gemma-2-2b-jpn-it-q4f16_1-MLC' },
  { label: 'Gemma 2 9B (stronger)', value: 'gemma-2-9b-it-q4f16_1-MLC' },
  { label: 'Gemma 2B (legacy)', value: 'gemma-2b-it-q4f16_1-MLC' },
  { label: 'Local LLM (OpenAI-compatible API)', value: LOCAL_LLM_MODEL_ID },
]);

/** A saved model id as the UI and service worker should treat it (missing or removed provider -> default). */
export function normalizeModelId(saved) {
  return !saved || saved === REMOVED_CHATGPT_MODEL_ID ? DEFAULT_MODEL : saved;
}
