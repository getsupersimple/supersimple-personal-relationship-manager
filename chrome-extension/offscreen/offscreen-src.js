/**
 * Offscreen document: routes LLM requests (chat, factoid parsing, message summaries) to their handlers.
 * Has full document context (WebGPU) unlike the service worker.
 */
import { handleWebllmChat } from './handlers/chat-handler.js';
import { handleWebllmSummarizeMessage } from './handlers/summarize-handler.js';
import { handleWebllmParseFactoids } from './handlers/parse-factoids-handler.js';

const LOG = (...args) => console.log('[PRM offscreen]', ...args);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'WEBLLM_PARSE_FACTOIDS') {
    (async () => {
      try {
        return await handleWebllmParseFactoids(msg, LOG);
      } catch (e) {
        LOG('Parse factoids error:', e.message, e.stack);
        return { error: e.message || 'Parse failed. Try rephrasing.' };
      }
    })().then(sendResponse);
    return true;
  }

  if (msg.action === 'WEBLLM_SUMMARIZE_MESSAGE') {
    (async () => {
      try {
        return await handleWebllmSummarizeMessage(msg, LOG);
      } catch (e) {
        LOG('Summarize message error:', e.message);
        return { error: e.message || 'Summarize failed' };
      }
    })().then(sendResponse);
    return true;
  }

  if (msg.action === 'WEBLLM_CHAT') {
    (async () => {
      try {
        return await handleWebllmChat(msg, LOG);
      } catch (e) {
        LOG('WEBLLM_CHAT error:', e.message);
        return { error: e.message || 'Ask AI failed' };
      }
    })().then(sendResponse);
    return true;
  }

  return false;
});

LOG('Offscreen script loaded');
