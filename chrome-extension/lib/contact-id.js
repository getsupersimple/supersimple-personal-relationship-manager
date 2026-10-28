/**
 * Deterministic contact ids: `<platform>:<16 hex chars>`, a one-way hash of the platform's normalized identifier
 * (profile URL, email, chat key), so re-importing the same person always yields the same id (ADR 0002).
 * Changing the hash or any normalizer orphans every factoid for that platform; harness/tests/identity.test.mjs pins it.
 */
import { generateId } from '../shared/types.js';

/** FNV-1a 64-bit prime and offset. */
const FNV64_PRIME = 0x100000001b3n;
const FNV64_OFFSET = 0xcbf29ce484222325n;

/**
 * Deterministic 64-bit FNV-1a hash of a string, hex-encoded (16 chars). Not cryptographic (see ADR 0002).
 * @param {string} s
 * @returns {string}
 */
export function hashStringToHex64(s) {
  let h = FNV64_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * FNV64_PRIME) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

/**
 * @param {'linkedin' | 'facebook' | 'gmail' | 'whatsapp'} platform
 * @param {string} normalized - the already-normalized identifier; empty means "nothing to hash"
 * @returns {string} `<platform>:<hash>`, or a random UUID when there is nothing to hash
 */
export function contactIdFromIdentifier(platform, normalized) {
  return normalized ? `${platform}:${hashStringToHex64(normalized)}` : generateId();
}
