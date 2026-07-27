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

import { GoogleAutoBackup, requestBackupNow } from '@/components/GoogleAutoBackup';
import { exportBackup } from '@/lib/data';

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
async function settle(ms = 6000, rounds = 6) {
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
