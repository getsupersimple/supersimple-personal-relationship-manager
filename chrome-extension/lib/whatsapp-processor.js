/**
 * Process WhatsApp direct chats from a background tab scrape.
 * Only one-to-one chats should be passed in here.
 */
import { storage } from './storage.js';
import { generateId } from '../shared/types.js';
import { deduplicateAndMerge } from './dedup.js';
import { contactIdFromIdentifier } from './contact-id.js';

const LOG = (...args) => console.log('[PRM whatsapp-processor]', ...args);

function normalizeWhatsAppChatKey(chatKey) {
  if (!chatKey || typeof chatKey !== 'string') return '';
  return chatKey.trim().toLowerCase();
}

function contactIdFromWhatsAppChat(chatKey) {
  return contactIdFromIdentifier('whatsapp', normalizeWhatsAppChatKey(chatKey));
}

/**
 * @param {Array<{ name: string, chatKey: string, previewText?: string, phoneE164?: string }>} chats
 */
export async function processWhatsAppConnections(chats) {
  LOG('processWhatsAppConnections: received', chats?.length, 'rows');
  const now = new Date().toISOString();
  const contacts = (chats || [])
    .map((c) => {
      const name = (c.name || '').trim();
      const chatKey = normalizeWhatsAppChatKey(c.chatKey);
      if (!name || !chatKey) return null;
      const contactId = contactIdFromWhatsAppChat(chatKey);
      const waPlatform = {
        id: contactId,
        name,
        chatKey,
        profileUrl: 'https://web.whatsapp.com/',
        isDirectChat: true,
      };
      if (c.phoneE164) waPlatform.phoneE164 = c.phoneE164;
      if (c.previewText) waPlatform.lastPreview = c.previewText;
      return {
        id: contactId,
        displayName: name,
        primaryEmail: undefined,
        platforms: { whatsapp: waPlatform },
        factoids: c.previewText
          ? [{ id: generateId(), key: 'last_message_preview', value: c.previewText, source: 'whatsapp' }]
          : [],
        lastInteraction: now,
        addedAt: now,
      };
    })
    .filter(Boolean);

  LOG('processWhatsAppConnections: normalized', contacts.length, 'direct contacts');
  let existing = await storage.getAllContacts();
  if (existing.length === 0 && contacts.length > 0) {
    existing = await storage.getAllContacts();
  }
  const { contacts: merged } = deduplicateAndMerge(existing, contacts);
  LOG('processWhatsAppConnections: after dedup', merged.length, 'contacts');
  await storage.saveContacts(merged);
}
