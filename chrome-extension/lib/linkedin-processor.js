/**
 * Processes LinkedIn connection data from content script
 * Merges with existing contacts via dedup
 */
import { storage } from './storage.js';
import { generateId } from '../shared/types.js';
import { deduplicateAndMerge } from './dedup.js';
import { normalizeLinkedInProfileUrl } from './linkedin-url.js';
import { contactIdFromIdentifier } from './contact-id.js';

const LOG = (...args) => console.log('[PRM linkedin-processor]', ...args);

const SEED_PROFILES = new Set(['linkedin.com/in/johndoe', 'linkedin.com/in/janesmith']);

function isSeedContact(c) {
  const url = c.platforms?.linkedin?.profileUrl || '';
  return SEED_PROFILES.has(url.replace(/^https?:\/\/(www\.)?/i, '').split('?')[0]);
}

export { normalizeLinkedInProfileUrl };

/**
 * Deterministic contact id for LinkedIn based on a one-way hash of the profile URL.
 * This keeps IDs stable across syncs without storing the raw URL in the id.
 * @param {string} profileUrl
 */
function contactIdFromProfileUrl(profileUrl) {
  return contactIdFromIdentifier('linkedin', normalizeLinkedInProfileUrl(profileUrl));
}

/**
 * Merge one batch of LinkedIn rows into IndexedDB (dedupe with existing). Safe to call repeatedly during sync
 * (e.g. after each pagination page or DOM scrape iteration).
 * @param {Array<{ name: string, headline?: string, profileUrl: string, company?: string, connectedOn?: string, commonConnectionCount?: number }>} connections
 * @returns {Promise<void>}
 */
export async function mergeLinkedInConnectionsBatch(connections) {
  return processConnections(connections);
}

/**
 * @param {Array<{ name: string, headline?: string, profileUrl: string, company?: string, connectedOn?: string, commonConnectionCount?: number }>} connections
 */
export async function processConnections(connections) {
  LOG('processConnections: received', connections?.length, 'connections');
  const now = new Date().toISOString();
  const contacts = connections.map((c) => {
    const profileUrl = c.profileUrl;
    const normalizedProfileUrl = normalizeLinkedInProfileUrl(profileUrl);
    const commonCount = typeof c.commonConnectionCount === 'number' && c.commonConnectionCount >= 0 ? c.commonConnectionCount : undefined;
    const contactId = contactIdFromProfileUrl(profileUrl);
    return {
      id: contactId,
      displayName: c.name || 'Unknown',
      primaryEmail: undefined,
      platforms: {
        linkedin: {
          profileUrl,
          normalizedProfileUrl,
          id: contactId,
          name: c.name || undefined,
          headline: c.headline,
          company: c.company,
          connectedOn: c.connectedOn,
          ...(commonCount !== undefined && { commonConnectionCount: commonCount }),
        },
      },
      factoids: c.headline ? [{ id: generateId(), key: 'headline', value: c.headline, source: 'linkedin' }] : [],
      lastInteraction: now,
      addedAt: now,
    };
  });

  let existing = await storage.getAllContacts();
  if (existing.length === 0 && contacts.length > 0) {
    LOG('processConnections: getAllContacts returned 0; retrying once (possible cold start)');
    existing = await storage.getAllContacts();
  }
  LOG('processConnections: existing contacts:', existing.length);
  const { contacts: merged } = deduplicateAndMerge(existing, contacts);
  const filtered = merged.filter((c) => !isSeedContact(c));
  if (filtered.length < merged.length) {
    LOG('processConnections: removed', merged.length - filtered.length, 'seed contacts');
  }
  LOG('processConnections: after dedup, merged count:', filtered.length, '(added', filtered.length - existing.length, 'new)');
  try {
    await storage.saveContacts(filtered);
    LOG('processConnections: saved', filtered.length, 'contacts to storage');
  } catch (e) {
    LOG('processConnections: saveContacts FAILED:', e);
    throw e;
  }
}
