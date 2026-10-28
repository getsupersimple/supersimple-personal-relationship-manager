/**
 * Fixed bottom banner showing WebLLM model download progress, driven by chrome.storage.local's
 * `prmModelDownloadProgress` key (written by the offscreen document's initProgressCallback in
 * mlc-engine.js). Storage change events reach every open extension page automatically, so this
 * shows on pages that didn't trigger the download too — matches this codebase's existing
 * broadcast pattern for contact sync updates (pingContactsUpdated in background/sw.js).
 *
 * Expects the host page to include this markup:
 *   <div id="modelDownloadBanner" class="model-download-banner hidden">
 *     <span id="modelDownloadText" class="model-download-text"></span>
 *     <div class="model-download-track"><div id="modelDownloadFill" class="model-download-fill"></div></div>
 *     <span id="modelDownloadPercent" class="model-download-percent"></span>
 *   </div>
 */
export function initModelDownloadBanner() {
  const banner = document.getElementById('modelDownloadBanner');
  const textEl = document.getElementById('modelDownloadText');
  const fillEl = document.getElementById('modelDownloadFill');
  const percentEl = document.getElementById('modelDownloadPercent');
  if (!banner || !textEl || !fillEl || !percentEl) return;

  function render(state) {
    if (!state) {
      banner.classList.add('hidden');
      return;
    }
    const pct = Math.max(0, Math.min(100, Math.round((state.progress || 0) * 100)));
    textEl.textContent = state.text || 'Downloading AI model…';
    fillEl.style.width = `${pct}%`;
    percentEl.textContent = `${pct}%`;
    banner.classList.remove('hidden');
  }

  chrome.storage.local.get('prmModelDownloadProgress').then((r) => render(r.prmModelDownloadProgress));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !('prmModelDownloadProgress' in changes)) return;
    render(changes.prmModelDownloadProgress.newValue);
  });
}
