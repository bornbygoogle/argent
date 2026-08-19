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
 * Canonicalise a nested value: objects rebuilt with their keys sorted, arrays
 * mapped element-wise, primitives returned as-is.
 *
 * Only nested values go through this. Transactions — the table that dominates
 * the row count — hold no nested objects at all, so for them this is a pure
 * pass-through and the cost falls on the handful of rows in `budgets` and
 * `recurrings` that actually nest.
 */
function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src).sort()) {
    if (src[k] !== undefined) out[k] = canonicalValue(src[k]);
  }
  return out;
}

/**
 * Build a row serialiser for one table.
 *
 * Object key order normally survives a round-trip through IndexedDB, but it is
 * not guaranteed, and an order flip would read as a data change and fire a
 * pointless backup. So the output must be canonical — keys always emitted in
 * sorted order.
 *
 * The previous version bought that by sorting each row's keys, once per row.
 * At 29k transactions that single line was 76% of the whole fingerprint. Every
 * row in a table shares a shape, so the sort is hoisted: compute the sorted key
 * union once per table, then let the engine's own (C++) JSON.stringify do the
 * text. Restricting a sorted union to the keys a row actually has yields the
 * same order as sorting that row's own keys, so the output is unchanged.
 */
function tableSerialiser(rows: unknown[]): (row: unknown) => string {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    for (const k in r) if (r[k] !== undefined) keys.add(k);
  }
  const sorted = [...keys].sort();
  return (row) => {
    if (row === null || typeof row !== 'object') return JSON.stringify(row) ?? 'null';
    const r = row as Record<string, unknown>;
    const canonical: Record<string, unknown> = {};
    for (const k of sorted) {
      const v = r[k];
      if (v !== undefined) canonical[k] = canonicalValue(v);
    }
    return JSON.stringify(canonical);
  };
}

/**
 * cyrb53 — a fast 53-bit non-cryptographic hash. Two independent 32-bit lanes
 * are mixed into one value, which makes an accidental collision between two
 * successive database states vanishingly unlikely without the cost (and the
 * async ceremony) of SubtleCrypto.
 */
function hash53Lanes(text: string): [number, number] {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [h1 >>> 0, (2097151 & h2) >>> 0];
}

/** The 53-bit hash as a compact string, for combining table summaries. */
function hash53(text: string): string {
  const [h1, h2] = hash53Lanes(text);
  return (4294967296 * h2 + h1).toString(36);
}

/**
 * Read every backed-up table and return a fingerprint of their contents.
 *
 * Reading all rows is what makes this correct: Dexie's liveQuery re-runs on any
 * mutation of a table it touched, so touching every table means every edit is
 * observed, and hashing the rows means every edit is *reported*.
 *
 * Rows are folded into commutative accumulators (two summed lanes, two XORed
 * lanes, plus the row count) rather than collected, sorted and joined. That
 * keeps the result independent of the order Dexie hands rows back — the
 * guarantee the old sort provided — without materialising a string the size of
 * the entire database on every keystroke. Sum and XOR are kept together
 * deliberately: XOR alone cancels a duplicated row, sum alone is weaker to
 * rearrangement, and the pair plus the count separates the cases that matter.
 */
export async function computeSyncFingerprint(): Promise<string> {
  const parts: string[] = [];
  for (const name of SYNCED_TABLES) {
    const table = (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[name];
    const rows = await table.toArray();
    const serialise = tableSerialiser(rows);
    let sum1 = 0;
    let sum2 = 0;
    let xor1 = 0;
    let xor2 = 0;
    for (const row of rows) {
      const [h1, h2] = hash53Lanes(serialise(row));
      sum1 = (sum1 + h1) >>> 0;
      sum2 = (sum2 + h2) >>> 0;
      xor1 ^= h1;
      xor2 ^= h2;
    }
    parts.push(
      `${name}:${rows.length}:${sum1.toString(36)}:${sum2.toString(36)}:` +
        `${(xor1 >>> 0).toString(36)}:${(xor2 >>> 0).toString(36)}`,
    );
  }
  return hash53(parts.join(''));
}
