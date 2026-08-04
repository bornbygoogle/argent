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

describe('two instalments a month is the ceiling', () => {
  const inMonth = async (month: string) =>
    (await db.transactions.toArray()).filter((t) => t.date.startsWith(month));

  it('refuses the third instalment a run of due-day edits would open', async () => {
    // Editing the due day makes an already-settled month read as unpaid again,
    // so Log offers itself once more. Two entries in a month is allowed; the
    // third is what turned this into unbounded duplication.
    freeze(2026, 7, 25); // 25 Aug 2026
    const id = await createRecurring({ ...base, dueDay: 5 });

    expect(await confirmRecurring(await load(id))).not.toBeNull();
    await updateRecurring(id, { dueDay: 10 });
    expect(await confirmRecurring(await load(id))).not.toBeNull();
    await updateRecurring(id, { dueDay: 15 });
    expect(await confirmRecurring(await load(id))).toBeNull();
    await updateRecurring(id, { dueDay: 20 });
    expect(await confirmRecurring(await load(id))).toBeNull();

    expect(await inMonth('2026-08')).toHaveLength(2);
  });

  it('writes nothing at all once the month is full', async () => {
    freeze(2026, 7, 25);
    const id = await createRecurring({ ...base, dueDay: 5 });
    await confirmRecurring(await load(id));
    await updateRecurring(id, { dueDay: 10 });
    await confirmRecurring(await load(id));

    const before = await load(id);
    await updateRecurring(id, { dueDay: 15 });
    expect(await confirmRecurring(await load(id))).toBeNull();

    // The refusal leaves history untouched — no half-written entry.
    expect((await load(id)).history).toHaveLength(before.history.length);
  });

  it('holds the line when presses land concurrently on one stale snapshot', async () => {
    freeze(2026, 7, 25);
    const id = await createRecurring({ ...base, dueDay: 5 });
    const stale = await load(id);

    await Promise.all([
      confirmRecurring(stale),
      confirmRecurring(stale),
      confirmRecurring(stale),
    ]);

    // All three settle the same instalment, so idempotency should collapse them
    // to one — and every transaction written must be recorded in history.
    const written = await inMonth('2026-08');
    expect(written).toHaveLength(1);
    expect((await load(id)).history).toHaveLength(1);
  });

  it('still walks a backlog one instalment per month', async () => {
    freeze(2026, 3, 10); // created 10 Apr 2026
    const id = await createRecurring({ ...base, dueDay: 5 });
    freeze(2026, 7, 25); // now 25 Aug 2026
    for (let i = 0; i < 6; i++) await confirmRecurring(await load(id));

    const dates = (await db.transactions.toArray()).map((t) => t.date).sort();
    expect(dates).toEqual(['2026-05-05', '2026-06-05', '2026-07-05', '2026-08-05']);
  });

  it('does not let a re-confirm of a settled instalment eat into the ceiling', async () => {
    freeze(2026, 7, 25);
    const id = await createRecurring({ ...base, dueDay: 5 });
    const first = await confirmRecurring(await load(id));
    // Same instalment again — idempotent, so it must not count as a second.
    expect(await confirmRecurring(await load(id))).toBe(first);

    await updateRecurring(id, { dueDay: 10 });
    expect(await confirmRecurring(await load(id))).not.toBeNull();
    expect(await inMonth('2026-08')).toHaveLength(2);
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
