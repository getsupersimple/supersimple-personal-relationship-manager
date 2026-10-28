/**
 * Per-network contact backup: CSV with base fields, platform JSON blob, factoids JSON array.
 */
import { storage } from './storage.js';
import { deduplicateAndMerge } from './dedup.js';
import { getEffectiveContactIds } from './contact-effective-ids.js';

/** @type {readonly string[]} */
export const NETWORK_CSV_HEADERS = Object.freeze([
  'id',
  'displayName',
  'primaryEmail',
  'lastInteraction',
  'addedAt',
  'conversationSummary',
  'conversationSummaryPlatform',
  'conversationSummaryAt',
  'recentAccessesJson',
  'platformJson',
  'factoidsJson',
]);

/**
 * Same shape as NETWORK_CSV_HEADERS but one row per contact (not per platform-membership), with
 * `platformsJson` holding every network the contact has at once instead of a single platform.
 * @type {readonly string[]}
 */
export const ALL_CONTACTS_CSV_HEADERS = Object.freeze([
  'id',
  'displayName',
  'primaryEmail',
  'lastInteraction',
  'addedAt',
  'conversationSummary',
  'conversationSummaryPlatform',
  'conversationSummaryAt',
  'recentAccessesJson',
  'platformsJson',
  'factoidsJson',
]);

/** @param {string | null | undefined} field */
function escapeCsvField(field) {
  const s = field == null ? '' : String(field);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** @param {string[]} cells */
function rowToCsvLine(cells) {
  return `${cells.map(escapeCsvField).join(',')}\r\n`;
}

/**
 * Minimal RFC-style CSV parser (quoted fields, doubled quotes, commas, newlines).
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      pushField();
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      pushField();
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (inQuotes) {
    throw new Error('CSV has an unclosed quoted field');
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * @param {import('../shared/types.js').Contact[]} contacts
 * @returns {Promise<import('../shared/types.js').Contact[]>}
 */
async function hydrateFactoids(contacts) {
  return Promise.all(
    contacts.map(async (c) => {
      const rows = await storage.getFactoidsByContactId(c.id);
      const factoids = rows.map((f) => ({
        id: f.id,
        key: f.key,
        value: f.value,
        source: f.source,
      }));
      return { ...c, factoids };
    }),
  );
}

/**
 * Factoid rows for a contact across every id merged into it (own id + absorbed ids), de-duplicated by key:value.
 * Export only: import and hydrateFactoids keep using the contact's own id.
 * @param {import('../shared/types.js').Contact} c
 */
async function factoidRowsForExport(c) {
  const seen = new Set();
  const rows = [];
  for (const id of getEffectiveContactIds(c)) {
    for (const f of await storage.getFactoidsByContactId(id)) {
      const k = f.key + ':' + f.value;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push(f);
    }
  }
  return rows;
}

const PLATFORMS = ['linkedin', 'facebook', 'whatsapp', 'gmail'];

function assertPlatform(platform) {
  if (!PLATFORMS.includes(platform)) throw new Error('Invalid platform: ' + platform);
}

/**
 * One CSV line per contact: the shared base columns, then `platformCell` (a JSON string) and the factoids JSON.
 * @param {import('../shared/types.js').Contact[]} contacts
 * @param {readonly string[]} headers
 * @param {(c: import('../shared/types.js').Contact) => unknown} platformValue - what goes in the platform column
 */
async function contactsToCsv(contacts, headers, platformValue) {
  const lines = [rowToCsvLine([...headers])];
  for (const c of contacts) {
    const factoids = (await factoidRowsForExport(c)).map((f) => ({
      id: f.id,
      key: f.key,
      value: f.value,
      source: f.source,
    }));
    lines.push(
      rowToCsvLine([
        c.id ?? '',
        c.displayName ?? '',
        c.primaryEmail ?? '',
        c.lastInteraction ?? '',
        c.addedAt ?? '',
        c.conversationSummary ?? '',
        c.conversationSummaryPlatform ?? '',
        c.conversationSummaryAt != null ? String(c.conversationSummaryAt) : '',
        JSON.stringify(Array.isArray(c.recentAccesses) ? c.recentAccesses : []),
        JSON.stringify(platformValue(c)),
        JSON.stringify(factoids),
      ]),
    );
  }
  return lines.join('');
}

/**
 * Parse and validate contact CSV text against `headers`, then merge the contacts into the database.
 * @param {string} csvText
 * @param {readonly string[]} headers - exact expected header row (the platform column is index 9: `platformJson` or `platformsJson`)
 * @param {(blob: object) => Record<string, object>} toPlatforms - maps the parsed platform JSON to Contact.platforms
 * @returns {Promise<{ importedRows: number, totalContacts: number }>}
 */
async function importContactsCsv(csvText, headers, toPlatforms) {
  const rows = parseCsv(csvText.trim());
  if (rows.length < 2) {
    throw new Error('CSV has no data rows.');
  }
  const header = rows[0].map((h) => String(h).trim());
  if (header.length !== headers.length || !headers.every((h, i) => header[i] === h)) {
    throw new Error(`Invalid CSV header. Expected columns: ${headers.join(', ')}`);
  }
  const platformColumn = headers[9];

  /** Parse one JSON cell; `kind` is 'object' or 'array' and decides the validation message. */
  const parseJsonCell = (r, column, fallback, kind) => {
    let value;
    try {
      value = JSON.parse(String(column.raw || fallback));
    } catch {
      throw new Error(`Row ${r + 1}: invalid ${column.name}`);
    }
    const ok = kind === 'object' ? value && typeof value === 'object' && !Array.isArray(value) : Array.isArray(value);
    if (!ok) throw new Error(`Row ${r + 1}: ${column.name} must be a JSON ${kind}`);
    return value;
  };

  /** @type {import('../shared/types.js').Contact[]} */
  const incoming = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells || cells.every((c) => !String(c).trim())) continue;
    while (cells.length < headers.length) cells.push('');
    const obj = Object.fromEntries(headers.map((key, idx) => [key, cells[idx] ?? '']));

    const id = String(obj.id || '').trim();
    if (!id) throw new Error(`Row ${r + 1}: missing id`);

    const platformBlob = parseJsonCell(r, { name: platformColumn, raw: obj[platformColumn] }, '{}', 'object');
    const factoids = parseJsonCell(r, { name: 'factoidsJson', raw: obj.factoidsJson }, '[]', 'array');
    let recentAccesses = [];
    try {
      recentAccesses = JSON.parse(String(obj.recentAccessesJson || '[]'));
    } catch {
      throw new Error(`Row ${r + 1}: invalid recentAccessesJson`);
    }
    if (!Array.isArray(recentAccesses)) recentAccesses = [];

    const summaryAtRaw = String(obj.conversationSummaryAt || '').trim();
    const conversationSummaryAt =
      summaryAtRaw === '' || Number.isNaN(Number(summaryAtRaw)) ? undefined : Number(summaryAtRaw);

    /** @type {import('../shared/types.js').Contact} */
    const contact = {
      id,
      displayName: String(obj.displayName || '').trim() || 'Unknown',
      ...(String(obj.primaryEmail || '').trim() ? { primaryEmail: String(obj.primaryEmail).trim() } : {}),
      lastInteraction: String(obj.lastInteraction || '').trim() || new Date().toISOString(),
      ...(String(obj.addedAt || '').trim() ? { addedAt: String(obj.addedAt).trim() } : {}),
      ...(String(obj.conversationSummary || '').trim() ? { conversationSummary: String(obj.conversationSummary) } : {}),
      ...(String(obj.conversationSummaryPlatform || '').trim()
        ? { conversationSummaryPlatform: String(obj.conversationSummaryPlatform).trim() }
        : {}),
      ...(conversationSummaryAt !== undefined ? { conversationSummaryAt } : {}),
      ...(recentAccesses.length > 0 ? { recentAccesses } : {}),
      platforms: toPlatforms(platformBlob),
      factoids: factoids.map((f) => ({
        id: f.id,
        key: f.key ?? '',
        value: f.value ?? '',
        source: f.source,
      })),
    };
    incoming.push(contact);
  }

  if (incoming.length === 0) {
    throw new Error('No contact rows found in CSV.');
  }

  const existing = await hydrateFactoids(await storage.getAllContacts());
  const { contacts: merged } = deduplicateAndMerge(existing, incoming);
  await storage.saveContacts(merged);
  return { importedRows: incoming.length, totalContacts: merged.length };
}

function datestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function triggerDownload(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** @param {string} name - e.g. "linkedin-contacts", "factoids" */
function downloadCsv(name, csv) {
  triggerDownload(`prm-${name}-${datestamp()}.csv`, csv, 'text/csv;charset=utf-8');
}

/**
 * @param {'linkedin' | 'facebook' | 'whatsapp' | 'gmail'} platform
 * @returns {Promise<string>}
 */
export async function exportPlatformContactsCsv(platform) {
  assertPlatform(platform);
  const subset = (await storage.getAllContacts()).filter((c) => Boolean(c?.platforms?.[platform]));
  return contactsToCsv(subset, NETWORK_CSV_HEADERS, (c) => {
    const plat = c.platforms?.[platform];
    return plat && typeof plat === 'object' ? plat : {};
  });
}

/**
 * @param {'linkedin' | 'facebook' | 'whatsapp' | 'gmail'} platform
 * @param {string} csvText
 * @returns {Promise<{ importedRows: number, totalContacts: number }>}
 */
export async function importPlatformContactsCsv(platform, csvText) {
  assertPlatform(platform);
  return importContactsCsv(csvText, NETWORK_CSV_HEADERS, (blob) => ({ [platform]: blob }));
}

/** @param {'linkedin' | 'facebook' | 'whatsapp' | 'gmail'} platform */
export async function downloadPlatformContactsCsv(platform) {
  assertPlatform(platform);
  downloadCsv(`${platform}-contacts`, await exportPlatformContactsCsv(platform));
}

/**
 * Every contact across all networks, one row per contact with all of that contact's platforms
 * embedded together (unlike exportPlatformContactsCsv, which is scoped to one network).
 * @returns {Promise<string>}
 */
export async function exportAllContactsCsv() {
  return contactsToCsv(await storage.getAllContacts(), ALL_CONTACTS_CSV_HEADERS, (c) =>
    c.platforms && typeof c.platforms === 'object' ? c.platforms : {},
  );
}

/**
 * Re-import an exportAllContactsCsv file, merging (not replacing) with what is already stored.
 * @param {string} csvText
 * @returns {Promise<{ importedRows: number, totalContacts: number }>}
 */
export async function importAllContactsCsv(csvText) {
  return importContactsCsv(csvText, ALL_CONTACTS_CSV_HEADERS, (platforms) => platforms);
}

export async function downloadAllContactsCsv() {
  downloadCsv('all-contacts', await exportAllContactsCsv());
}

/** @type {readonly string[]} */
export const FACTOIDS_CSV_HEADERS = Object.freeze(['contactId', 'key', 'value', 'source']);
/** Files exported before 1.84.0 had a `displayName` column; import still accepts them and ignores the name. */
const LEGACY_FACTOIDS_CSV_HEADERS = Object.freeze(['contactId', 'displayName', 'key', 'value', 'source']);

/**
 * Every factoid across all contacts, independent of platform data. Contact ids are deterministic
 * hashes of each platform's profile URL/email/chat key, so re-syncing the same accounts from
 * scratch regenerates the same ids — importing this file afterward reattaches each factoid to its
 * matching contact without needing a full contacts backup.
 * @returns {Promise<string>}
 */
export async function exportFactoidsCsv() {
  const factoids = await storage.getAllFactoids();
  const lines = [rowToCsvLine([...FACTOIDS_CSV_HEADERS])];
  for (const f of factoids) {
    lines.push(rowToCsvLine([f.contactId ?? '', f.key ?? '', f.value ?? '', f.source ?? '']));
  }
  return lines.join('');
}

/**
 * Re-attach factoids from a backup by contactId, merging into (not replacing) each contact's
 * current factoids so importing doesn't erase notes added since the backup was taken.
 * @param {string} csvText
 * @returns {Promise<{ importedRows: number, matchedContacts: number, unmatchedContacts: number }>}
 */
export async function importFactoidsCsv(csvText) {
  const rows = parseCsv(csvText.trim());
  if (rows.length < 2) {
    throw new Error('CSV has no data rows.');
  }
  const header = rows[0].map((h) => String(h).trim());
  const isLegacy = header.length === LEGACY_FACTOIDS_CSV_HEADERS.length && LEGACY_FACTOIDS_CSV_HEADERS.every((h, i) => header[i] === h);
  const expected = isLegacy ? [...LEGACY_FACTOIDS_CSV_HEADERS] : [...FACTOIDS_CSV_HEADERS];
  if (header.length !== expected.length || !expected.every((h, i) => header[i] === h)) {
    throw new Error(`Invalid CSV header. Expected columns: ${FACTOIDS_CSV_HEADERS.join(', ')}`);
  }

  /** @type {Map<string, Array<{ key: string, value: string, source?: string }>>} */
  const byContactId = new Map();
  let importedRows = 0;
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells || cells.every((c) => !String(c).trim())) continue;
    while (cells.length < expected.length) cells.push('');
    const obj = Object.fromEntries(expected.map((key, idx) => [key, cells[idx] ?? '']));

    const contactId = String(obj.contactId || '').trim();
    if (!contactId) {
      throw new Error(`Row ${r + 1}: missing contactId`);
    }
    const key = String(obj.key || '').trim();
    if (!key) continue;

    const list = byContactId.get(contactId) || [];
    list.push({ key, value: String(obj.value || ''), source: String(obj.source || '').trim() || undefined });
    byContactId.set(contactId, list);
    importedRows++;
  }

  if (importedRows === 0) {
    throw new Error('No factoid rows found in CSV.');
  }

  const allContacts = await storage.getAllContacts();
  const existingContactIds = new Set(allContacts.map((c) => c.id));
  let matchedContacts = 0;
  let unmatchedContacts = 0;
  for (const [contactId, incomingFactoids] of byContactId) {
    if (existingContactIds.has(contactId)) matchedContacts++;
    else unmatchedContacts++;

    const existing = await storage.getFactoidsByContactId(contactId);
    const seen = new Set(existing.map((f) => f.key + ':' + f.value));
    const merged = existing.map((f) => ({ id: f.id, key: f.key, value: f.value, source: f.source }));
    for (const f of incomingFactoids) {
      const dedupeKey = f.key + ':' + f.value;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        merged.push(f);
      }
    }
    await storage.saveFactoidsForContact(contactId, merged);
  }

  return { importedRows, matchedContacts, unmatchedContacts };
}

export async function downloadFactoidsCsv() {
  downloadCsv('factoids', await exportFactoidsCsv());
}
