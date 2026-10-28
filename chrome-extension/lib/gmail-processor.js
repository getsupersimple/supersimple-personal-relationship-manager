/**
 * Process Google Contacts rows from tab scrape into contacts (`platforms.gmail`).
 */
import { storage } from './storage.js';
import { deduplicateAndMerge } from './dedup.js';
import { contactIdFromIdentifier } from './contact-id.js';

const LOG = (...args) => console.log('[PRM gmail-processor]', ...args);

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function contactIdFromGmailEmail(email) {
  return contactIdFromIdentifier('gmail', normalizeEmail(email));
}

/**
 * @param {Array<{ name: string, email: string }>} rows
 */
export async function processGmailContacts(rows) {
  LOG('processGmailContacts: received', rows?.length, 'rows');
  const now = new Date().toISOString();
  const contacts = (rows || [])
    .map((r) => {
      const email = normalizeEmail(r?.email);
      const name = String(r?.name || '').trim();
      if (!email || !email.includes('@')) return null;
      const displayName = name || email.split('@')[0] || email;
      const contactId = contactIdFromGmailEmail(email);
      return {
        id: contactId,
        displayName,
        primaryEmail: email,
        platforms: {
          gmail: {
            id: contactId,
            email,
            ...(name ? { name } : {}),
          },
        },
        factoids: [],
        lastInteraction: now,
        addedAt: now,
      };
    })
    .filter(Boolean);

  LOG('processGmailContacts: normalized', contacts.length, 'contacts');
  let existing = await storage.getAllContacts();
  if (existing.length === 0 && contacts.length > 0) {
    existing = await storage.getAllContacts();
  }
  const { contacts: merged } = deduplicateAndMerge(existing, contacts);
  LOG('processGmailContacts: after dedup', merged.length, 'contacts');
  await storage.saveContacts(merged);
}
