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
import { dueDateFor } from '@/lib/recurringSchedule';

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

describe('a due day moved after the month was already settled', () => {
  const inAugust = async () =>
    (await db.transactions.toArray()).filter((t) => t.date.startsWith('2026-08'));

  it('leaves that month settled', async () => {
    freeze(2026, 7, 3); // 3 Aug, paying ahead of a 5th
    const id = await createRecurring({ ...base, dueDay: 5 });
    await confirmRecurring(await load(id));
    expect(isConfirmedIn(await load(id), '2026-08')).toBe(true);

    await updateRecurring(id, { dueDay: 20 });

    // The instalment was paid. Moving the day describes when the *next* one
    // falls, it does not un-pay the one already settled.
    expect(isConfirmedIn(await load(id), '2026-08')).toBe(true);
  });

  it('records nothing further for that month, however often the day moves', async () => {
    freeze(2026, 7, 3);
    const id = await createRecurring({ ...base, dueDay: 5 });
    const first = await confirmRecurring(await load(id));

    for (const day of [10, 15, 20, 25]) {
      await updateRecurring(id, { dueDay: day });
      expect(await confirmRecurring(await load(id))).toBe(first);
    }

    expect(await inAugust()).toHaveLength(1);
  });

  it('can still be un-logged once the day has moved', async () => {
    freeze(2026, 7, 3);
    const id = await createRecurring({ ...base, dueDay: 5 });
    await confirmRecurring(await load(id));
    await updateRecurring(id, { dueDay: 20 });

    const r = await load(id);
    await unconfirmRecurring(r, dueDateFor(r, '2026-08'));

    expect(await db.transactions.count()).toBe(0);
    expect((await load(id)).history).toHaveLength(0);
    expect(isConfirmedIn(await load(id), '2026-08')).toBe(false);
  });

  it('still lets the following month fall due on the new day', async () => {
    freeze(2026, 7, 3);
    const id = await createRecurring({ ...base, dueDay: 5 });
    await confirmRecurring(await load(id));
    await updateRecurring(id, { dueDay: 20 });

    vi.setSystemTime(new Date(2026, 8, 21, 12, 0, 0)); // 21 Sep
    expect(isConfirmedIn(await load(id), '2026-09')).toBe(false);

    const txId = await confirmRecurring(await load(id));
    expect((await db.transactions.get(txId!))?.date).toBe('2026-09-20');
  });
});

describe('a recurring is never logged more than twice in a month', () => {
  const inMonth = async (month: string) =>
    (await db.transactions.toArray()).filter((t) => t.date.startsWith(month));

  /**
   * A month carrying instalments that no history entry names. The concurrent
   * double-press used to leave exactly this: the losing writes survived as
   * transactions while only the last entry was kept, so the month reads as
   * unsettled and offers itself however many copies it already holds.
   */
  const withUnnamedInstalments = async (dates: string[]) => {
    const id = await createRecurring({ ...base, dueDay: 5 });
    await db.transactions.bulkAdd(
      dates.map((date, i) => ({
        id: `orphan-${i}`,
        kind: 'expense' as const,
        accountId: 'acc-1',
        amount: 600,
        date,
        recurringSourceId: id,
        createdAt: `${date}T10:00:00.000Z`,
        updatedAt: `${date}T10:00:00.000Z`,
      })),
    );
    return id;
  };

  it('refuses a further instalment once the month already holds two', async () => {
    freeze(2026, 7, 25); // 25 Aug 2026
    const id = await withUnnamedInstalments(['2026-08-05', '2026-08-10']);

    expect(await confirmRecurring(await load(id))).toBeNull();
    expect(await inMonth('2026-08')).toHaveLength(2);
  });

  it('counts what the month really holds, not what history admits to', async () => {
    // History names none of them, so nothing but a count of the transactions
    // themselves can see that the month is already at its ceiling.
    freeze(2026, 7, 25);
    const id = await withUnnamedInstalments(['2026-08-05', '2026-08-10']);

    expect((await load(id)).history).toHaveLength(0);
    expect(await confirmRecurring(await load(id))).toBeNull();
  });

  it('writes nothing at all when it refuses', async () => {
    freeze(2026, 7, 25);
    const id = await withUnnamedInstalments(['2026-08-05', '2026-08-10']);

    expect(await confirmRecurring(await load(id))).toBeNull();

    // No transaction, and no half-written history entry either.
    expect(await inMonth('2026-08')).toHaveLength(2);
    expect((await load(id)).history).toHaveLength(0);
  });

  it('still admits a month that holds only one', async () => {
    freeze(2026, 7, 25);
    const id = await withUnnamedInstalments(['2026-08-05']);

    expect(await confirmRecurring(await load(id))).not.toBeNull();
    expect(await inMonth('2026-08')).toHaveLength(2);
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

  it('never reaches the ceiling by ordinary use, whatever the due day does', async () => {
    // The ceiling is a backstop, not a budget. Pressing Log repeatedly and
    // moving the day between presses settles the month exactly once.
    freeze(2026, 7, 25);
    const id = await createRecurring({ ...base, dueDay: 5 });
    const first = await confirmRecurring(await load(id));

    for (const day of [10, 15, 20, 25, 28]) {
      expect(await confirmRecurring(await load(id))).toBe(first);
      await updateRecurring(id, { dueDay: day });
      expect(await confirmRecurring(await load(id))).toBe(first);
    }

    expect(await inMonth('2026-08')).toHaveLength(1);
    expect((await load(id)).history).toHaveLength(1);
  });
});

describe('a month the repair trimmed down to two', () => {
  it('reads as settled, and gives them back one at a time, newest first', async () => {
    // The shape left on real data: two instalments kept by dedupeRecurringMonths,
    // both named by history. The month is done — and stays done until both are
    // taken back, so undoing one cannot reopen it for a fresh duplicate.
    freeze(2026, 7, 25); // 25 Aug 2026
    const id = await createRecurring({ ...base, dueDay: 15 });
    await db.transactions.bulkAdd([
      {
        id: 'tx-1', kind: 'expense', accountId: 'acc-1', amount: 600,
        date: '2026-08-05', recurringSourceId: id,
        createdAt: '2026-08-05T10:00:00.000Z', updatedAt: '2026-08-05T10:00:00.000Z',
      },
      {
        id: 'tx-2', kind: 'expense', accountId: 'acc-1', amount: 600,
        date: '2026-08-10', recurringSourceId: id,
        createdAt: '2026-08-10T10:00:00.000Z', updatedAt: '2026-08-10T10:00:00.000Z',
      },
    ]);
    await db.recurrings.update(id, {
      history: [
        { month: '2026-08', amount: 600, transactionId: 'tx-1', occurrence: '2026-08-05' },
        { month: '2026-08', amount: 600, transactionId: 'tx-2', occurrence: '2026-08-10' },
      ],
    });

    expect(isConfirmedIn(await load(id), '2026-08')).toBe(true);

    const undo = async () => {
      const r = await load(id);
      await unconfirmRecurring(r, dueDateFor(r, '2026-08'));
    };

    await undo();
    expect((await db.transactions.toArray()).map((t) => t.id)).toEqual(['tx-1']);
    expect(isConfirmedIn(await load(id), '2026-08')).toBe(true);

    await undo();
    expect(await db.transactions.count()).toBe(0);
    expect(isConfirmedIn(await load(id), '2026-08')).toBe(false);
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
