// End-to-end behaviour of the Drive sync loop, with Drive itself mocked.
// The questions this answers: does an edit actually reach Drive, does a restore
// actually come back, and can either one clobber the other?
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { db } from '@/db/db';
import type { Account, Transaction } from '@/types/models';

const drive = vi.hoisted(() => ({
  uploadBackupToFolder: vi.fn(),
  listBackupsInFolder: vi.fn(),
  downloadBackupFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock('@/lib/google/drive', () => drive);
vi.mock('@/lib/google/auth', () => ({
  withTokenRefresh: (fn: (t: string) => unknown) => fn('token'),
}));
vi.mock('@/lib/google/folderStore', async () => {
  const actual = await vi.importActual<typeof import('@/lib/google/folderStore')>(
    '@/lib/google/folderStore',
  );
  return { ...actual, ensureGestionMoneyFolder: vi.fn(async () => 'folder-1') };
});

const auth = vi.hoisted(() => ({ status: 'signed-in' as 'signed-in' | 'signed-out' }));
vi.mock('@/store/GoogleAuthContext', () => ({
  useGoogleAuth: () => ({
    status: auth.status,
    getValidAccessToken: async () => 'token',
    reportBackupDone: vi.fn(),
    reportBackupError: vi.fn(),
  }),
  setBackingUp: vi.fn(),
  markRestoredJustNow: vi.fn(),
}));
vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { GoogleAutoBackup, requestBackupNow, PUSH_DEBOUNCE_MS } from '@/components/GoogleAutoBackup';
import { exportBackup } from '@/lib/data';
import { computeSyncFingerprint } from '@/lib/syncFingerprint';
import { getGoogleMeta, setGoogleMeta } from '@/lib/google/folderStore';

const account = (id: string, name = 'Courant'): Account => ({
  id, name, type: 'courant', color: '#3F8F6B', icon: 'Wallet',
  openingBalance: 0, order: 0, archived: false, createdAt: '2026-01-01T00:00:00.000Z',
});
const tx = (id: string, amount = 10): Transaction => ({
  id, kind: 'expense', accountId: 'a1', amount, date: '2026-03-01',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

/**
 * Drain the mixed real/fake scheduling this component sits on: IndexedDB and
 * liveQuery run on real immediates, the debounce on a fake timer. One pass is
 * not enough — the live query must emit before the effect can arm the timer,
 * and the upload chain then awaits more database work. Alternate until quiet.
 */
async function settle(ms = PUSH_DEBOUNCE_MS + 1000, rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(ms);
    });
  }
}

beforeEach(async () => {
  auth.status = 'signed-in';
  drive.uploadBackupToFolder.mockResolvedValue({ id: 'f1', name: 'argent-backup.json' });
  drive.listBackupsInFolder.mockResolvedValue([]);
  drive.downloadBackupFile.mockReset();
  drive.deleteFile.mockResolvedValue(undefined);
  drive.uploadBackupToFolder.mockClear();

  // Seed on real timers: fake-indexeddb schedules its work on setImmediate, so
  // faking timers before the database is ready deadlocks the setup.
  // Clear rather than delete/reopen: a previous test's in-flight sync chain can
  // still touch the database, and closing it under them throws
  // DatabaseClosedError as an unhandled rejection that could mask a real one.
  if (!db.isOpen()) await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  await db.accounts.put(account('a1'));
  await db.transactions.put(tx('t1'));

  // Fake only what the component's debounce and throttle use. setImmediate is
  // left real so IndexedDB keeps draining underneath.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('auto backup', () => {
  // The regression that mattered: this edit changes no row count, so the old
  // detector never fired and the correction never reached Drive.
  it('uploads after an amount is corrected in place', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    drive.uploadBackupToFolder.mockClear();

    await act(async () => {
      await db.transactions.update('t1', { amount: 999 });
    });
    await settle();

    expect(drive.uploadBackupToFolder).toHaveBeenCalledTimes(1);
    const payload = drive.uploadBackupToFolder.mock.calls[0][1];
    expect(payload.tables.transactions[0].amount).toBe(999);
  });

  it('uploads after a category is created', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    drive.uploadBackupToFolder.mockClear();

    await act(async () => {
      await db.categories.put({
        id: 'c1', name: 'Courses', icon: 'ShoppingCart', color: '#000',
        isDefault: false, sortOrder: 0,
      });
    });
    await settle();

    expect(drive.uploadBackupToFolder).toHaveBeenCalledTimes(1);
  });

  it('uploads after an account is renamed', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    drive.uploadBackupToFolder.mockClear();

    await act(async () => {
      await db.accounts.update('a1', { name: 'Renamed' });
    });
    await settle();

    expect(drive.uploadBackupToFolder).toHaveBeenCalledTimes(1);
  });

  it('does not upload when nothing changed', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    drive.uploadBackupToFolder.mockClear();

    await settle(30_000);
    expect(drive.uploadBackupToFolder).not.toHaveBeenCalled();
  });

  it('coalesces a burst of edits into one upload', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    drive.uploadBackupToFolder.mockClear();

    await act(async () => {
      await db.transactions.put(tx('t2'));
      await db.transactions.put(tx('t3'));
      await db.transactions.update('t1', { amount: 42 });
    });
    await settle();

    expect(drive.uploadBackupToFolder).toHaveBeenCalledTimes(1);
  });

  it('does not upload while signed out', async () => {
    auth.status = 'signed-out';
    render(<GoogleAutoBackup />);
    await settle();

    await act(async () => {
      await db.transactions.update('t1', { amount: 5 });
    });
    await settle();

    expect(drive.uploadBackupToFolder).not.toHaveBeenCalled();
  });
});

describe('prune', () => {
  /** A Drive listing entry `ageMs` older than the current (fake) clock. */
  const at = (id: string, ageMs: number) => ({
    id,
    name: `argent-backup-${id}.json`,
    modifiedTime: new Date(Date.now() - ageMs).toISOString(),
  });

  it('keeps older tiers and drops the middle of a burst', async () => {
    const MIN = 60_000;
    const files = [
      at('r0', 0), at('r1', MIN), at('r2', 2 * MIN),
      at('r3', 3 * MIN), at('r4', 4 * MIN), at('r5', 5 * MIN),
      at('yesterday', 24 * 3600_000),
      at('weekAgo', 8 * 24 * 3600_000),
    ];
    // First call is the opening pull (nothing on Drive); later calls are prunes.
    drive.listBackupsInFolder.mockReset();
    drive.listBackupsInFolder.mockResolvedValueOnce([]).mockResolvedValue(files);

    render(<GoogleAutoBackup />);
    await settle();
    await act(async () => {
      await db.transactions.put(tx('t2'));
    });
    await settle();

    const deleted = drive.deleteFile.mock.calls.map((c) => c[0]).sort();
    // The old keep-5-newest policy deleted r5, yesterday and weekAgo — wiping
    // every restore point older than the burst. The tiers must survive.
    expect(deleted).not.toContain('yesterday');
    expect(deleted).not.toContain('weekAgo');
    expect(deleted).toEqual(['r3', 'r4', 'r5']);
  });
});

describe('restore on start', () => {
  it('imports a newer backup from another device', async () => {
    const remote = { ...(await exportBackup('other-device')) };
    remote.tables.transactions = [tx('remote-1', 777)];
    drive.listBackupsInFolder.mockResolvedValue([
      { id: 'f9', name: 'argent-backup.json', modifiedTime: '2030-01-01T00:00:00.000Z' },
    ]);
    drive.downloadBackupFile.mockResolvedValue(JSON.stringify(remote));

    render(<GoogleAutoBackup />);
    await settle();

    expect(await db.transactions.get('remote-1')).toBeTruthy();
    expect(await db.transactions.get('t1')).toBeUndefined();
  });

  // Otherwise every app start costs an upload of data that just came down.
  it('does not re-upload what it just restored', async () => {
    const remote = { ...(await exportBackup('other-device')) };
    remote.tables.transactions = [tx('remote-1', 777)];
    drive.listBackupsInFolder.mockResolvedValue([
      { id: 'f9', name: 'argent-backup.json', modifiedTime: '2030-01-01T00:00:00.000Z' },
    ]);
    drive.downloadBackupFile.mockResolvedValue(JSON.stringify(remote));

    render(<GoogleAutoBackup />);
    await settle(30_000);

    expect(drive.uploadBackupToFolder).not.toHaveBeenCalled();
  });

  it('skips its own snapshot', async () => {
    const own = await exportBackup('other-device');
    drive.listBackupsInFolder.mockResolvedValue([
      { id: 'f9', name: 'argent-backup.json', modifiedTime: '2030-01-01T00:00:00.000Z' },
    ]);
    drive.downloadBackupFile.mockResolvedValue(JSON.stringify(own));

    render(<GoogleAutoBackup />);
    await settle();
    // Nothing was wiped: the local row survives.
    expect(await db.transactions.get('t1')).toBeTruthy();
  });
});

// An installed PWA can stay open for days. Without this, a change made on the
// phone never reaches the laptop until the laptop is reloaded.
describe('refresh while the app stays open', () => {
  const remoteNewer = async () => {
    const remote = await exportBackup('other-device');
    remote.tables.transactions = [tx('remote-1', 777)];
    drive.downloadBackupFile.mockResolvedValue(JSON.stringify(remote));
    drive.listBackupsInFolder.mockResolvedValue([
      { id: 'f9', name: 'argent-backup.json', modifiedTime: '2030-01-01T00:00:00.000Z' },
    ]);
  };

  /** Move past the 60s floor between two Drive re-checks. */
  const pastThrottle = () => settle(70_000, 1);

  it('pulls again when the tab comes back to the foreground', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    expect(await db.transactions.get('remote-1')).toBeUndefined();

    await remoteNewer(); // another device uploads while this tab is in the background
    await pastThrottle();

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();

    expect(await db.transactions.get('remote-1')).toBeTruthy();
  });

  it('pulls again when the network comes back', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    await remoteNewer();
    await pastThrottle();

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await settle();

    expect(await db.transactions.get('remote-1')).toBeTruthy();
  });

  it('throttles a burst of foreground events into one check', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    await pastThrottle();
    drive.listBackupsInFolder.mockClear();

    // Past the floor, so the first event is allowed through; the other two land
    // inside the window it opens and must be dropped. The handler reads the
    // fingerprint before deciding, so give it several ticks to get there.
    const drain = async () => {
      for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
    };
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await drain();
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
      await drain();
    });

    expect(drive.listBackupsInFolder).toHaveBeenCalledTimes(1);
  });

  it('does not pull on top of an edit that has not been uploaded yet', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    await remoteNewer();
    await pastThrottle(); // the throttle is NOT what blocks this one

    // A local edit arms the 5s debounce; the foreground event lands before it
    // fires. Importing here would drop the remote snapshot on the local change.
    await act(async () => {
      await db.transactions.update('t1', { amount: 4242 });
      await new Promise((resolve) => setImmediate(resolve));
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(await db.transactions.get('remote-1')).toBeUndefined();
    expect((await db.transactions.get('t1'))?.amount).toBe(4242);

    // Let Dexie's mutation broadcast fire before the fake clock is torn down:
    // left pending, it silences every live-query emit for the rest of the file.
    // Well short of the debounce, so nothing is uploaded here.
    await settle(1000, 2);
  });
});

describe('manual backup', () => {
  it('uploads immediately without waiting for the debounce', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    drive.uploadBackupToFolder.mockClear();

    await act(async () => {
      await requestBackupNow();
    });

    expect(drive.uploadBackupToFolder).toHaveBeenCalledTimes(1);
  });

  // It used to resolve without uploading, and the caller printed "Backup done".
  // Note the outcome is captured rather than asserted through act(): an
  // assertion that throws inside act() surfaces as an unhandled rejection and
  // the test passes anyway.
  it('rejects when the upload fails, instead of reporting success', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    drive.uploadBackupToFolder.mockClear();
    drive.uploadBackupToFolder.mockRejectedValueOnce(new Error('google-upload-failed (500)'));

    let outcome = 'resolved';
    await act(async () => {
      await requestBackupNow().catch(() => {
        outcome = 'rejected';
      });
    });

    expect(drive.uploadBackupToFolder).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('rejected');
  });

  // The gate that used to make this resolve silently: a manual backup fired
  // while the opening pull is still in flight must still upload.
  it('waits for the opening pull rather than no-oping', async () => {
    let releasePull: (v: unknown) => void = () => {};
    drive.listBackupsInFolder.mockImplementationOnce(
      () => new Promise((resolve) => { releasePull = resolve; }),
    );

    render(<GoogleAutoBackup />);
    await settle(0, 2); // let the pull start, but leave it hanging

    let done = false;
    const manual = requestBackupNow().then(() => { done = true; });
    expect(done).toBe(false);

    await act(async () => {
      releasePull([]);
      await settle();
      await manual;
    });

    expect(done).toBe(true);
    expect(drive.uploadBackupToFolder).toHaveBeenCalled();
  });
});

// The loss this guards against: an edit made, then the tab reloaded inside the
// debounce. The upload never happened, and after the reload nothing remembered
// that it had not — so the next pull replaced the edit with the other device's
// older snapshot. The fingerprint of the last upload now survives in the
// database, so the app can tell "already on Drive" from "never left".
describe('a change that never reached Drive', () => {
  const remoteNewer = async () => {
    const remote = await exportBackup('other-device');
    remote.tables.transactions = [tx('remote-1', 777)];
    drive.downloadBackupFile.mockResolvedValue(JSON.stringify(remote));
    drive.listBackupsInFolder.mockResolvedValue([
      { id: 'f9', name: 'argent-backup.json', modifiedTime: '2030-01-01T00:00:00.000Z' },
    ]);
  };

  /** Pretend the last upload carried the database as it is right now. */
  const markAsPushed = async () => {
    await setGoogleMeta({ pushedFingerprint: await computeSyncFingerprint() });
  };

  it('is uploaded on start instead of being replaced by a newer remote snapshot', async () => {
    await markAsPushed();
    await db.transactions.update('t1', { amount: 4242 }); // edited, then reloaded
    await remoteNewer();

    render(<GoogleAutoBackup />);
    await settle(0, 8); // no debounce: the flush must not wait 30s to be safe

    expect((await db.transactions.get('t1'))?.amount).toBe(4242);
    expect(await db.transactions.get('remote-1')).toBeUndefined();
    expect(drive.uploadBackupToFolder).toHaveBeenCalledTimes(1);
    const payload = drive.uploadBackupToFolder.mock.calls[0][1];
    expect(payload.tables.transactions[0].amount).toBe(4242);
  });

  it('still restores a newer remote snapshot when nothing local is pending', async () => {
    await markAsPushed();
    await remoteNewer();

    render(<GoogleAutoBackup />);
    await settle();

    expect(await db.transactions.get('remote-1')).toBeTruthy();
    expect(drive.uploadBackupToFolder).not.toHaveBeenCalled();
  });

  it('remembers what it uploaded', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    await act(async () => {
      await db.transactions.update('t1', { amount: 999 });
    });
    await settle();

    expect(drive.uploadBackupToFolder).toHaveBeenCalled();
    expect((await getGoogleMeta()).pushedFingerprint).toBe(await computeSyncFingerprint());
  });

  it('remembers what it restored', async () => {
    await remoteNewer();
    render(<GoogleAutoBackup />);
    await settle();

    expect(await db.transactions.get('remote-1')).toBeTruthy();
    expect((await getGoogleMeta()).pushedFingerprint).toBe(await computeSyncFingerprint());
  });

  // Switching PC means leaving this tab. Upload then, not 30s later.
  it('is flushed when the tab is hidden', async () => {
    render(<GoogleAutoBackup />);
    await settle();
    drive.uploadBackupToFolder.mockClear();

    await act(async () => {
      await db.transactions.update('t1', { amount: 31 });
    });
    await settle(1000, 4); // debounce armed, not fired

    expect(drive.uploadBackupToFolder).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await settle(1000, 6);
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    }

    expect(drive.uploadBackupToFolder).toHaveBeenCalledTimes(1);
    expect(drive.uploadBackupToFolder.mock.calls[0][1].tables.transactions[0].amount).toBe(31);
  });
});

// A cleared timeout left in place still reads as "an upload is scheduled", and
// that reading is what keeps every later foreground pull out. Signing out with
// an edit pending is the way to strand one: the handle is cleared, the effect
// returns before arming another, and the ref keeps pointing at the dead one.
describe('after signing out with an edit pending', () => {
  it('still pulls when the tab comes back to the foreground', async () => {
    const { rerender } = render(<GoogleAutoBackup />);
    await settle();

    await act(async () => {
      await db.transactions.update('t1', { amount: 8 });
    });
    await settle(1000, 4); // debounce armed, not fired

    auth.status = 'signed-out';
    await act(async () => {
      rerender(<GoogleAutoBackup />);
    });
    auth.status = 'signed-in';
    await act(async () => {
      rerender(<GoogleAutoBackup />);
    });
    await settle();

    const remote = await exportBackup('other-device');
    remote.tables.transactions = [tx('remote-1', 777)];
    drive.downloadBackupFile.mockResolvedValue(JSON.stringify(remote));
    drive.listBackupsInFolder.mockResolvedValue([
      { id: 'f9', name: 'argent-backup.json', modifiedTime: '2030-01-01T00:00:00.000Z' },
    ]);
    await settle(70_000, 1); // past the re-check floor

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();

    expect(await db.transactions.get('remote-1')).toBeTruthy();
  });
});

// The gap the first fix left open. A device that has been syncing for months
// has no baseline the moment it first runs this code, and "no baseline" was
// read as "nothing pending" — so the guard stood down on exactly the start
// where the unsent work was still sitting there, and the older snapshot came
// down on top of it. Real state, 2026-09-03: last upload 24h old, a morning's
// instalments logged since, and no fingerprint to notice with.
describe('the first start after the baseline existed', () => {
  const dated = (id: string, at: string): Transaction => ({
    ...tx(id),
    createdAt: at,
    updatedAt: at,
  });
  /** This device has uploaded before — long enough ago to say nothing useful. */
  const syncedBefore = () => setGoogleMeta({ lastBackupAt: '2026-01-01T00:00:00.000Z' });
  const driveHolds = async (rows: Transaction[]) => {
    const remote = await exportBackup('other-device');
    remote.tables.transactions = rows;
    drive.downloadBackupFile.mockResolvedValue(JSON.stringify(remote));
    drive.listBackupsInFolder.mockResolvedValue([
      { id: 'f9', name: 'argent-backup.json', modifiedTime: '2030-01-01T00:00:00.000Z' },
    ]);
  };

  it('uploads work done in a session that ended before its upload ran', async () => {
    await syncedBefore();
    await driveHolds([dated('remote-1', '2026-09-02T13:00:00.000Z')]);
    await db.transactions.put(dated('logged-this-morning', '2026-09-03T06:37:00.000Z'));

    render(<GoogleAutoBackup />);
    await settle(0, 8); // the flush must not wait out the debounce

    expect(await db.transactions.get('logged-this-morning')).toBeTruthy();
    expect(await db.transactions.get('remote-1')).toBeUndefined();
    expect(drive.uploadBackupToFolder).toHaveBeenCalledTimes(1);
  });

  it('still takes a snapshot holding work this device never saw', async () => {
    await syncedBefore();
    await driveHolds([dated('remote-1', '2026-09-03T06:37:00.000Z')]);

    render(<GoogleAutoBackup />);
    await settle();

    expect(await db.transactions.get('remote-1')).toBeTruthy();
    expect(drive.uploadBackupToFolder).not.toHaveBeenCalled();
  });
});
