// Persistence for the Google backup feature's per-device metadata. Stored in a
// dedicated `'google'` row of the Dexie `settings` store (keyed by string),
// decoupled from `SettingsState` so it doesn't trigger theme/locale re-applies.
//
//   folderId      — Drive id of the "GestionMoney" folder this app created.
//   lastBackupAt  — ISO time of the most recent backup THIS device pushed.
//                   Used by the auto-pull gate (only pull if Drive is newer).
//   lastPulledAt  — ISO time of the most recent restore this device pulled.
//   deviceId      — random per-device id stamped into every backup payload,
//                   so a device can recognise (and skip) its own uploads.
//   pushedFingerprint — fingerprint (lib/syncFingerprint) of the last snapshot
//                   this device uploaded or imported, i.e. the last state known
//                   to match Drive. Persisted so a reload cannot forget that an
//                   edit never left: while the database differs from this, the
//                   local copy is the newer truth and must be pushed, not pulled
//                   over. Null until the first sync after the field appeared.

import { db } from '@/db/db';
import { findFolderByName, createFolder } from './drive';

const KEY = 'google';

export interface GoogleMetaRow {
  key: 'google';
  folderId: string | null;
  lastBackupAt: string | null;
  lastPulledAt: string | null;
  deviceId: string;
  pushedFingerprint: string | null;
}

const DEFAULT: GoogleMetaRow = {
  key: 'google',
  folderId: null,
  lastBackupAt: null,
  lastPulledAt: null,
  deviceId: '',
  pushedFingerprint: null,
};

/** True when the database no longer matches the last snapshot exchanged with Drive. */
export function hasUnsyncedChanges(meta: GoogleMetaRow, fingerprint: string): boolean {
  return meta.pushedFingerprint !== null && meta.pushedFingerprint !== fingerprint;
}

// Untyped accessors: the `settings` table is strictly typed for the `'app'`
// row, so reach in through an `any`-keyed handle rather than coupling this row
// to SettingsRecord's shape (same pattern lib/data.ts uses).
const settingsTable = db.settings as unknown as {
  get: (key: string) => Promise<Partial<GoogleMetaRow> | undefined>;
  put: (row: GoogleMetaRow) => Promise<unknown>;
};

async function getRaw(): Promise<GoogleMetaRow> {
  const rec = await settingsTable.get(KEY);
  return { ...DEFAULT, ...(rec ?? {}) };
}

export async function getGoogleMeta(): Promise<GoogleMetaRow> {
  return getRaw();
}

export async function setGoogleMeta(patch: Partial<GoogleMetaRow>): Promise<void> {
  const current = await getRaw();
  const next: GoogleMetaRow = { ...current, ...patch, key: KEY };
  await settingsTable.put(next);
}

/** Stable per-device id; created on first use and reused thereafter. */
export async function getOrCreateDeviceId(): Promise<string> {
  const meta = await getRaw();
  if (meta.deviceId) return meta.deviceId;
  const deviceId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await setGoogleMeta({ deviceId });
  return deviceId;
}

let inflightFolder: Promise<string> | null = null;

/**
 * Resolve the "GestionMoney" folder id: persist-first (cached id wins),
 * otherwise find-or-create it on Drive, then cache the id. Concurrent callers
 * within a tab share one in-flight promise (de-dupes the create race).
 */
export async function ensureGestionMoneyFolder(token: string): Promise<string> {
  const meta = await getRaw();
  if (meta.folderId) return meta.folderId;
  if (inflightFolder) return inflightFolder;

  inflightFolder = (async () => {
    try {
      const FOLDER_NAME = 'GestionMoney';
      const existing = await findFolderByName(FOLDER_NAME, token);
      const folder = existing ?? (await createFolder(FOLDER_NAME, token));
      await setGoogleMeta({ folderId: folder.id });
      return folder.id;
    } finally {
      inflightFolder = null;
    }
  })();

  return inflightFolder;
}
