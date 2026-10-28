/**
 * Settings clean-up that runs in the service worker: the removed ChatGPT provider and expired message cache.
 * Kept out of sw.js so it can be unit-tested (harness/tests/provider.test.mjs).
 */
import { DEFAULT_MODEL, REMOVED_CHATGPT_MODEL_ID, normalizeModelId } from './model-ids.js';

/**
 * The built-in ChatGPT provider was removed (ADR 0003): a saved `chatgpt` model falls back to the default WebLLM
 * model, the stored OpenAI key is deleted, and Settings shows a one-time notice. Users who want OpenAI enter its
 * URL under "Local LLM". Safe to call repeatedly.
 */
export async function migrateRemovedChatGptProvider() {
  const { webllmModel, openaiApiKey } = await chrome.storage.local.get(['webllmModel', 'openaiApiKey']);
  if (openaiApiKey !== undefined) await chrome.storage.local.remove('openaiApiKey');
  if (webllmModel === REMOVED_CHATGPT_MODEL_ID) {
    await chrome.storage.local.set({
      webllmModel: DEFAULT_MODEL,
      prmProviderMigrationNotice:
        'The built-in ChatGPT option was removed and your OpenAI key was deleted. The default local model is selected. To use OpenAI or another server, choose "Local LLM" and enter its base URL.',
    });
  }
}

/** The saved model id, never the removed `chatgpt` provider. */
export async function getSelectedModelId() {
  const { webllmModel } = await chrome.storage.local.get('webllmModel');
  return normalizeModelId(webllmModel);
}

const LATEST_MESSAGE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Cached latest-message text is only useful within the refresh window; drop anything older than a week. */
export async function purgeExpiredLatestMessageCache() {
  const all = await chrome.storage.local.get(null);
  const cutoff = Date.now() - LATEST_MESSAGE_CACHE_MAX_AGE_MS;
  const stale = Object.keys(all).filter(
    (k) => k.startsWith('msgCache_') && !(typeof all[k]?.fetchedAt === 'number' && all[k].fetchedAt >= cutoff),
  );
  if (stale.length) await chrome.storage.local.remove(stale);
}
