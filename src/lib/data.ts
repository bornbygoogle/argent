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
  'incomeTypes',
  'monthClosures',
] as const;

export interface BackupPayload {
  app: 'argent';
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

/** Snapshot every domain table into a single JSON-serialisable payload. */
export async function exportBackup(): Promise<BackupPayload> {
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLES) {
    tables[name] = await (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[
      name
    ].toArray();
  }
  return { app: 'argent', version: 1, exportedAt: new Date().toISOString(), tables };
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

function isPayload(v: unknown): v is BackupPayload {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<BackupPayload>;
  return p.app === 'argent' && p.version === 1 && !!p.tables;
}

/** Restore a backup, replacing all domain rows. Settings are left untouched. */
export async function importBackup(raw: unknown): Promise<{ rows: number }> {
  if (!isPayload(raw)) throw new Error('invalid-backup');
  let rows = 0;
  const stores = [db.accounts, db.transactions, db.recurrings, db.budgets, db.categories, db.incomeTypes, db.monthClosures];
  await db.transaction('rw', stores, async () => {
    for (const name of TABLES) {
      const table = (db as unknown as Record<string, { clear: () => Promise<void>; bulkPut: (r: unknown[]) => Promise<unknown> }>)[name];
      const data = raw.tables[name];
      if (!Array.isArray(data)) continue;
      await table.clear();
      await table.bulkPut(data);
      rows += data.length;
    }
  });
  return { rows };
}

/** Wipe every domain table + settings, then re-seed defaults (fresh onboarding). */
export async function clearAllData(): Promise<void> {
  const stores = [...TABLES, 'settings'] as const;
  await db.transaction('rw', [db.accounts, db.transactions, db.recurrings, db.budgets, db.categories, db.incomeTypes, db.monthClosures, db.settings], async () => {
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
