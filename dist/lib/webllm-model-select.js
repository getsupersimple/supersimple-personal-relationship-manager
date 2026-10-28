/**
 * Model <select> helpers shared by the Settings page and by pages that let the user pick a model right where they
 * use it (Ask AI's composer, the Contacts page's "Add with AI" box). All of them read and write the same
 * chrome.storage.local `webllmModel` key.
 */
import { MODEL_OPTIONS, normalizeModelId } from './model-ids.js';

/**
 * Fill `selectEl` with MODEL_OPTIONS and select `currentValue`; an id that is not in the list (e.g. set by a raw
 * storage edit) is added as a "Custom: X" entry so it is not silently replaced.
 * @param {HTMLSelectElement} selectEl
 * @param {string} [currentValue]
 */
export function populateModelSelect(selectEl, currentValue) {
  const value = normalizeModelId(currentValue);
  selectEl.innerHTML = '';
  for (const { label, value: id } of MODEL_OPTIONS) {
    const opt = document.createElement('option');
    opt.textContent = label;
    opt.value = id;
    selectEl.appendChild(opt);
  }
  if (!MODEL_OPTIONS.some((o) => o.value === value)) {
    const opt = document.createElement('option');
    opt.textContent = `Custom: ${value}`;
    opt.value = value;
    selectEl.insertBefore(opt, selectEl.firstChild);
  }
  selectEl.value = value;
}

/**
 * Populate `selectEl` from the saved model and persist changes back to the shared webllmModel key.
 * @param {HTMLSelectElement} selectEl
 */
export async function initWebLLMModelSelect(selectEl) {
  try {
    const { webllmModel } = await chrome.storage.local.get('webllmModel');
    populateModelSelect(selectEl, webllmModel);
  } catch (e) {
    // Selection stays empty; downstream flows still work since the background worker re-reads
    // webllmModel from storage independently.
  }

  selectEl.addEventListener('change', () => {
    void chrome.storage.local.set({ webllmModel: selectEl.value });
  });
}
