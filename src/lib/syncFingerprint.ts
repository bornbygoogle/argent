// A fingerprint of everything a backup contains.
//
// The auto-backup trigger needs one property: the value must change if, and
// only if, the *content of the next backup* would differ. Anything weaker
// silently skips backups — counting rows misses every in-place edit (an amount
// correction, a renamed account, a new category), which is most of what a user
// actually does.
//
// So the fingerprint is derived from the same tables lib/data.ts exports,
// covering exactly what a restore would bring back. It is not a security
// primitive: it only has to distinguish one state of the database from the
// next, so a fast non-cryptographic hash is the right tool.

import { db } from '@/db/db';

/** The tables a backup carries — must stay in step with TABLES in lib/data.ts. */
export const SYNCED_TABLES = [
  'accounts',
  'transactions',
  'recurrings',
  'budgets',
  'categories',
  'subcategories',
  'incomeTypes',
  'incomeSubtypes',
  'monthClosures',
] as const;

/**
 * Serialise a row with its keys in a fixed order. Object key order normally
 * survives a round-trip through IndexedDB, but it is not guaranteed, and an
 * order flip would read as a data change and fire a pointless backup.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * cyrb53 — a fast 53-bit non-cryptographic hash. Two independent 32-bit lanes
 * are mixed into one value, which makes an accidental collision between two
 * successive database states vanishingly unlikely without the cost (and the
 * async ceremony) of SubtleCrypto.
 */
function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Read every backed-up table and return a fingerprint of their contents.
 *
 * Reading all rows is what makes this correct: Dexie's liveQuery re-runs on any
 * mutation of a table it touched, so touching every table means every edit is
 * observed, and hashing the rows means every edit is *reported*. Cost is linear
 * in the row count and paid only when something actually changed.
 */
export async function computeSyncFingerprint(): Promise<string> {
  const parts: string[] = [];
  for (const name of SYNCED_TABLES) {
    const table = (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[name];
    const rows = await table.toArray();
    // Dexie returns rows in primary-key order, so this is already stable; the
    // explicit sort just removes the dependency on that guarantee.
    const serialised = rows.map(stableStringify).sort();
    parts.push(`${name}:${rows.length}:${hash53(serialised.join(''))}`);
  }
  return hash53(parts.join(''));
}
