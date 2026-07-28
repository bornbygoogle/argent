// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before '@/db/db' — that module constructs the Dexie instance at load time.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db/db';
import {
  createRecurring,
  updateRecurring,
  confirmRecurring,
  unconfirmRecurring,
  isConfirmedIn,
} from '@/lib/recurring';
import type { Recurring, RecurringInput } from '@/lib/recurring';
import { currentMonth } from '@/lib/date';

const base: RecurringInput = {
  accountId: 'acc-1',
  direction: 'expense',
  label: 'Rent',
  amount: 600,
  cadence: 'mensuel',
  icon: 'Home',
  color: '#000000',
};

const load = async (id: string): Promise<Recurring> => {
  const r = await db.recurrings.get(id);
  if (!r) throw new Error(`recurring ${id} vanished`);
  return r;
};

/** Only Date is faked — faking the timer queue deadlocks Dexie. */
const freeze = (y: number, monthIndex: number, day: number, hour = 12) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(y, monthIndex, day, hour, 0, 0));
};

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reactivation boundary', () => {
  it('holds until the last instant of the month, then falls due again', async () => {
    freeze(2026, 6, 15);
    const id = await createRecurring(base);
    await confirmRecurring(await load(id));
    expect(isConfirmedIn(await load(id))).toBe(true);
    expect(currentMonth()).toBe('2026-07');

    vi.setSystemTime(new Date(2026, 6, 31, 23, 59, 59));
    expect(isConfirmedIn(await load(id))).toBe(true);

    // First instant of August — reactivated with no code running in between.
    vi.setSystemTime(new Date(2026, 7, 1, 0, 0, 0));
    expect(currentMonth()).toBe('2026-08');
    expect(isConfirmedIn(await load(id))).toBe(false);
  });

  it('re-confirming the same month creates nothing new', async () => {
    freeze(2026, 6, 15);
    const id = await createRecurring(base);
    const first = await confirmRecurring(await load(id));
    const second = await confirmRecurring(await load(id));
    expect(second).toBe(first);
    expect(await db.transactions.count()).toBe(1);
  });
});

describe('confirmRecurring transaction date', () => {
  it('uses the due day when confirmed late', async () => {
    freeze(2026, 7, 9); // 9 Aug, three days late
    const id = await createRecurring({ ...base, dueDay: 5 });
    const txId = await confirmRecurring(await load(id));
    expect((await db.transactions.get(txId!))?.date).toBe('2026-08-05');
  });

  it('uses the due day when confirmed early, future-dating it', async () => {
    freeze(2026, 7, 3); // 3 Aug, ahead of a 20th due day
    const id = await createRecurring({ ...base, dueDay: 20 });
    const txId = await confirmRecurring(await load(id));
    expect((await db.transactions.get(txId!))?.date).toBe('2026-08-20');
  });

  it('clamps a 31 into a short month', async () => {
    freeze(2026, 1, 20); // 20 Feb 2026
    const id = await createRecurring({ ...base, dueDay: 31 });
    const txId = await confirmRecurring(await load(id));
    expect((await db.transactions.get(txId!))?.date).toBe('2026-02-28');
  });

  it('falls back to the 1st when no day is set', async () => {
    freeze(2026, 7, 9);
    const id = await createRecurring(base);
    const txId = await confirmRecurring(await load(id));
    expect((await db.transactions.get(txId!))?.date).toBe('2026-08-01');
  });

  it('links the transaction back to its template', async () => {
    freeze(2026, 7, 9);
    const id = await createRecurring({ ...base, dueDay: 5 });
    const txId = await confirmRecurring(await load(id));
    expect((await db.transactions.get(txId!))?.recurringSourceId).toBe(id);
  });
});

describe('unconfirmRecurring', () => {
  it('deletes the linked transaction and drops the entry', async () => {
    freeze(2026, 7, 9);
    const id = await createRecurring({ ...base, dueDay: 5 });
    await confirmRecurring(await load(id));
    await unconfirmRecurring(await load(id));
    expect(await db.transactions.count()).toBe(0);
    expect((await load(id)).history).toHaveLength(0);
  });
});

describe('dueDay writes', () => {
  it('stores the day given at creation', async () => {
    freeze(2026, 7, 1);
    const id = await createRecurring({ ...base, dueDay: 12 });
    expect((await load(id)).dueDay).toBe(12);
  });

  it('leaves the day alone when the patch omits it', async () => {
    freeze(2026, 7, 1);
    const id = await createRecurring({ ...base, dueDay: 12 });
    await updateRecurring(id, { amount: 700 });
    const r = await load(id);
    expect(r.amount).toBe(700);
    expect(r.dueDay).toBe(12);
  });

  it('removes the property outright when the patch clears it', async () => {
    freeze(2026, 7, 1);
    const id = await createRecurring({ ...base, dueDay: 12 });
    await updateRecurring(id, { dueDay: null });
    const r = await load(id);
    // Not merely undefined: a cleared recurring must be indistinguishable from
    // one that never had a day, or the sync fingerprint sees a phantom change.
    expect('dueDay' in r).toBe(false);
  });
});
