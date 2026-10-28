import { CreateMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm';
import { DEFAULT_MODEL } from './constants.js';

const LOG = (...args) => console.log('[PRM offscreen]', ...args);

let engine = null;
let loadedModelId = null;
let loadPromise = null;
/** modelId the in-flight loadPromise is loading, so a repeat call for the SAME model reuses it
 * instead of racing a second reload — but a call for a DIFFERENT model while one is already
 * loading still starts fresh rather than reusing an unrelated in-flight promise. */
let loadingModelId = null;

/**
 * gemma3-1b-it-q4f16_1-MLC's hosted mlc-chat-config.json sets BOTH context_window_size (8192)
 * and sliding_window_size (512), which WebLLM rejects ("Only one ... can be positive"). Gemma 3
 * genuinely uses that 512-token sliding window architecturally — 5 of every 6 layers
 * (sliding_window_pattern: 6) use local attention with a RoPE base frequency (10000) tuned
 * specifically for that short range, unlike the one-in-six global layers. An earlier version of
 * this fix disabled sliding_window_size instead, which "worked" (no crash) but forced every
 * layer — including the local ones — into full attention over the whole 4096-token override
 * window, using RoPE encodings never calibrated for that range. That produced incoherent output
 * instead of a crash, which is worse. The correct fix is the other direction: disable OUR
 * context_window_size override (an arbitrary value applied from a generic template shared by
 * dozens of unrelated models) and let the model's own sliding_window_size govern, as designed.
 * That also means attention_sink_size (hosted as -1, meaning "not using sliding window") must be
 * overridden to 0 ("default sliding window") — WebLLM requires it non-negative once a sliding
 * window is actually active, or it throws AttentionSinkSizeError instead.
 * Scoped to this one model id — Gemma 2 variants were already working before any of this and
 * aren't touched.
 *
 * sliding_window_size is itself a genuinely runtime-configurable value, not something baked into
 * the compiled WASM. That WASM (gemma3-1b-it-q4f16_1_cs1k-webgpu.wasm) only fixes
 * prefill_chunk_size (the "_cs1k" in the filename — a prefill batching parameter, confirmed via
 * WebLLM's own `this.prefillChunkSize = metadata.prefill_chunk_size`), unrelated to the KV
 * cache's total capacity. That capacity (`maxTotalSeqLen` in WebLLM's LLMChatPipeline) is built
 * at model-load time from whatever sliding_window_size value ends up in the merged chat config —
 * confirmed by Gemma 2 2B using this exact same "_cs1k" compiled WASM yet reliably running at
 * context_window_size: 4096 in this app today, which wouldn't be possible if "_cs1k" capped total
 * context at ~1024. So the 512 ceiling crashing Ask AI on any real contact-context prompt is
 * specifically the model's hosted default sliding_window_size value, not a hard limit of the
 * runtime — overriding it should raise the actual KV cache allocation and stop the "Program
 * terminated with exit(1)" abort on longer prompts.
 * Deliberately did NOT set this to 4096 (matching the context_window_size the earlier, rejected
 * "disable sliding window" attempt used): for a conversation that never exceeds the configured
 * window, a sliding window that wide is numerically identical to no windowing at all — nothing
 * ever gets evicted, so it would silently reproduce that same already-rejected attempt rather
 * than test anything new. 2048 (4x the model's trained 512, well under that 4096 ceiling) keeps
 * eviction meaningfully different from the unwindowed case while giving real headroom over 512.
 * The known tradeoff: Gemma 3's local-attention layers (5 of every 6) were TRAINED with a
 * 512-token local window and a RoPE base frequency calibrated specifically for that short range.
 * Widening sliding_window_size makes those layers attend beyond what they were trained on, which
 * is the same underlying mechanism that made the fully-unwindowed attempt incoherent — just a
 * smaller extrapolation (512 -> 2048, 4x) than that attempt's effective jump to full, unbounded
 * attention. Whether real output stays coherent at this window size is an open, untested
 * question — that's what this change is for.
 * @returns {import('@mlc-ai/web-llm').AppConfig}
 */
function buildPatchedAppConfig() {
  const config = structuredClone(prebuiltAppConfig);
  const gemma3_1b = config.model_list.find((m) => m.model_id === 'gemma3-1b-it-q4f16_1-MLC');
  if (gemma3_1b?.overrides) {
    gemma3_1b.overrides.context_window_size = -1;
    gemma3_1b.overrides.attention_sink_size = 0;
    gemma3_1b.overrides.sliding_window_size = 2048;
  }
  return config;
}

const PATCHED_APP_CONFIG = buildPatchedAppConfig();

/**
 * Ensure the shared MLC engine is loaded with `modelId`, in offscreen context. Model
 * download/load progress is relayed via chrome.runtime.sendMessage to the service worker, which
 * writes it to chrome.storage.local — offscreen documents only support the runtime (messaging)
 * API, so chrome.storage is unavailable here directly (throws "Cannot read properties of
 * undefined (reading 'local')"); the service worker has full API access and does the actual
 * write, then every open extension page picks it up via chrome.storage.onChanged (same broadcast
 * pattern this codebase already uses for contact sync updates via pingContactsUpdated in sw.js).
 *
 * Previously this returned whatever engine was already cached regardless of the requested
 * modelId — `if (engine) return engine;` — meaning once ANY model had ever loaded in this
 * offscreen document's lifetime (which persists for the life of the extension, never closed),
 * every OTHER model selected afterward in Settings/Ask AI silently kept running on that first
 * one, with no error or indication anything was wrong. This produced confusing, seemingly
 * model-specific bugs that weren't actually about whichever model was reportedly selected.
 * Now tracks which model is actually loaded and calls the existing engine's own `.reload(modelId)`
 * to switch when a different one is requested — reusing the same instance (and its registered
 * appConfig/initProgressCallback, which WebLLM re-registers with the runtime on every reload, not
 * just the first) rather than constructing a whole new engine per switch.
 * @param {string} [modelId]
 */
export async function ensureEngine(modelId = DEFAULT_MODEL) {
  if (engine && loadedModelId === modelId) return engine;
  if (loadPromise && loadingModelId === modelId) return loadPromise;

  loadingModelId = modelId;
  LOG(engine ? 'Switching engine to model:' : 'Creating engine for model:', modelId);
  loadPromise = (async () => {
    try {
      if (!engine) {
        engine = await CreateMLCEngine(modelId, {
          appConfig: PATCHED_APP_CONFIG,
          initProgressCallback: (report) => {
            LOG('Init progress:', report.progress, report.text);
            chrome.runtime
              .sendMessage({ type: 'WEBLLM_PROGRESS', modelId, progress: report.progress, text: report.text })
              .catch(() => {});
          },
        });
      } else {
        await engine.reload(modelId);
      }
      loadedModelId = modelId;
      LOG('Engine ready:', modelId);
      return engine;
    } catch (e) {
      chrome.runtime.sendMessage({ type: 'WEBLLM_PROGRESS', modelId, progress: 1, text: '' }).catch(() => {});
      throw e;
    } finally {
      loadPromise = null;
      loadingModelId = null;
    }
  })();
  return loadPromise;
}
