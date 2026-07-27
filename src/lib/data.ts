// Backup / restore / wipe. Serialises every domain table to JSON and back.
// Settings are excluded from the export (device-local prefs) but reset on wipe.
import { db } from '@/db/db';
import { seedDefaults } from '@/db/seed';

const TABLES = [
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

export interface BackupPayload {
  app: 'argent';
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
  /** Random per-device id (see lib/google/folderStore.ts). Lets a device skip
   *  auto-importing its own just-pushed snapshot during cross-device sync. */
  exportedBy?: string;
}

/** Snapshot every domain table into a single JSON-serialisable payload. */
export async function exportBackup(deviceId?: string): Promise<BackupPayload> {
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLES) {
    tables[name] = await (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[
      name
    ].toArray();
  }
  return { app: 'argent', version: 1, exportedAt: new Date().toISOString(), tables, exportedBy: deviceId };
}

/** Trigger a browser download of the backup as `argent-backup-YYYY-MM-DD.json`. */
export function downloadBackup(payload: BackupPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `argent-backup-${payload.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Tables whose primary key is not a plain `id`. */
const COMPOUND_KEYS: Record<string, readonly string[]> = {
  monthClosures: ['accountId', 'month'],
};

function isPayload(v: unknown): v is BackupPayload {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<BackupPayload>;
  if (p.app !== 'argent' || p.version !== 1) return false;
  return !!p.tables && typeof p.tables === 'object' && !Array.isArray(p.tables);
}

/**
 * Characters a primary key may never contain: control characters, whitespace,
 * path separators and the URL-structural trio. Ids go straight into route paths
 * (`/expenses/${tx.id}`), and a restored row is the only way a string the app
 * did not generate gets there — which is precisely the input react-router's
 * open-redirect advisories need.
 *
 * Deliberately a deny-list, not an allow-list: an id shape this app once
 * generated but no longer does must still restore. Rejecting a legitimate old
 * backup would be data loss, which is the worse failure here.
 */
const UNSAFE_KEY_CHARS = /[\s/\\?#%]/;

/** Control characters, checked by code point so no escape sequence is needed. */
function hasControlChar(v: string): boolean {
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * A row is restorable only if it is a plain object carrying every part of its
 * table's primary key as a non-empty, route-safe string.
 *
 * This runs on data the app did not produce: a JSON file the user picked, or a
 * Drive file any application holding `drive.file` access could have written.
 * Without it, bulkPut writes whatever the file contains straight into the
 * tables every screen reads from.
 */
function isRestorableRow(row: unknown, keys: readonly string[]): boolean {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return false;
  // JSON.parse keeps "__proto__" as an *own* property; any later spread or
  // Object.assign of such a row would walk it back onto Object.prototype.
  if (Object.prototype.hasOwnProperty.call(row, '__proto__')) return false;
  const r = row as Record<string, unknown>;
  return keys.every((k) => {
    const v = r[k];
    if (typeof v !== 'string' || v.length === 0) return false;
    return !UNSAFE_KEY_CHARS.test(v) && !hasControlChar(v);
  });
}

/** Validate every table up-front, so a bad row aborts before anything is cleared. */
function assertRestorable(tables: Record<string, unknown>): void {
  for (const name of TABLES) {
    const data = tables[name];
    // An absent table is normal: backups predating a table simply omit its key.
    if (data === undefined || data === null) continue;
    const keys = COMPOUND_KEYS[name] ?? ['id'];
    if (!Array.isArray(data) || !data.every((row) => isRestorableRow(row, keys))) {
      throw new Error(`invalid-backup-rows:${name}`);
    }
  }
}

/** Restore a backup, replacing all domain rows. Settings are left untouched. */
export async function importBackup(raw: unknown): Promise<{ rows: number }> {
  if (!isPayload(raw)) throw new Error('invalid-backup');
  assertRestorable(raw.tables);
  let rows = 0;
  const stores = [db.accounts, db.transactions, db.recurrings, db.budgets, db.categories, db.subcategories, db.incomeTypes, db.incomeSubtypes, db.monthClosures];
  await db.transaction('rw', stores, async () => {
    for (const name of TABLES) {
      const table = (db as unknown as Record<string, { clear: () => Promise<void>; bulkPut: (r: unknown[]) => Promise<unknown> }>)[name];
      const data = raw.tables[name];
      // Clear even when the payload omits the table. A backup taken before
      // sub-categories existed has no `subcategories` key, and keeping the
      // local rows would leave them pointing at categories the restore just
      // replaced.
      await table.clear();
      if (!Array.isArray(data)) continue;
      await table.bulkPut(data);
      rows += data.length;
    }
  });
  return { rows };
}

/** Wipe every domain table + settings, then re-seed defaults (fresh onboarding). */
export async function clearAllData(): Promise<void> {
  const stores = [...TABLES, 'settings'] as const;
  await db.transaction('rw', [db.accounts, db.transactions, db.recurrings, db.budgets, db.categories, db.subcategories, db.incomeTypes, db.incomeSubtypes, db.monthClosures, db.settings], async () => {
    for (const name of stores) {
      await (db as unknown as Record<string, { clear: () => Promise<void> }>)[name].clear();
    }
  });
  await seedDefaults();
}

export function parseBackupFile(text: string): BackupPayload {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('invalid-json');
  }
  if (!isPayload(json)) throw new Error('invalid-backup');
  return json;
}
