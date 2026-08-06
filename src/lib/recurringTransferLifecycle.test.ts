// End to end, at the layer the user actually feels: what the balances say.
//
// The unit tests prove each write is shaped right. This one runs a template
// through the whole life it has on a phone — settle, restart the app (both
// repair passes, in the order App.tsx chains them), settle again, undo — and
// asks the only question that matters: does the money add up.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db/db';
import { createRecurring, confirmRecurring, unconfirmRecurring } from '@/lib/recurring';
import type { Recurring } from '@/lib/recurring';
import { backfillOccurrences } from '@/lib/recurringMigration';
import { dedupeRecurringMonths } from '@/lib/recurringDedupe';
import { accountBalance, totalBalance } from '@/lib/calc';
import { dueDateFor } from '@/lib/recurringSchedule';
import { currentMonth } from '@/lib/date';
import type { Account } from '@/types/models';

const account = (id: string, openingBalance: number): Account => ({
  id,
  name: id,
  type: 'courant',
  color: '#000',
  icon: 'Wallet',
  openingBalance,
  order: 0,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

/** What App.tsx chains on every start. */
const restartApp = async () => {
  await backfillOccurrences();
  await dedupeRecurringMonths();
};

const load = async (id: string): Promise<Recurring> => {
  const r = await db.recurrings.get(id);
  if (!r) throw new Error(`recurring ${id} vanished`);
  return r;
};

const balances = async () => {
  const accounts = await db.accounts.toArray();
  const tx = await db.transactions.toArray();
  return {
    current: accountBalance(accounts.find((a) => a.id === 'acc-current')!, tx),
    savings: accountBalance(accounts.find((a) => a.id === 'acc-savings')!, tx),
    net: totalBalance(accounts, tx),
  };
};

const freeze = (y: number, monthIndex: number, day: number) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(y, monthIndex, day, 12, 0, 0));
};

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.accounts.bulkAdd([account('acc-current', 1000), account('acc-savings', 0)]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a recurring transfer over its whole life', () => {
  const seed = () =>
    createRecurring({
      accountId: 'acc-current',
      receiverAccountId: 'acc-savings',
      direction: 'expense',
      label: 'Virement épargne',
      amount: 200,
      cadence: 'mensuel',
      icon: 'PiggyBank',
      color: '#000',
      dueDay: 5,
    });

  it('moves the money without creating or destroying any', async () => {
    freeze(2026, 7, 10);
    const id = await seed();
    await confirmRecurring(await load(id));

    expect(await balances()).toEqual({ current: 800, savings: 200, net: 1000 });
  });

  it('survives a restart untouched — the repair passes leave a healthy pair alone', async () => {
    freeze(2026, 7, 10);
    const id = await seed();
    await confirmRecurring(await load(id));
    await restartApp();

    expect(await balances()).toEqual({ current: 800, savings: 200, net: 1000 });
    expect(await db.transactions.count()).toBe(2);
  });

  it('charges once a month and no more, restart after restart', async () => {
    freeze(2026, 7, 10);
    const id = await seed();

    for (const day of [10, 15, 20]) {
      vi.setSystemTime(new Date(2026, 7, day, 12, 0, 0));
      await confirmRecurring(await load(id));
      await restartApp();
    }

    expect(await balances()).toEqual({ current: 800, savings: 200, net: 1000 });
  });

  it('charges again the next month, and both months stand', async () => {
    freeze(2026, 7, 10);
    const id = await seed();
    await confirmRecurring(await load(id));

    vi.setSystemTime(new Date(2026, 8, 10, 12, 0, 0));
    await confirmRecurring(await load(id));
    await restartApp();

    expect(await balances()).toEqual({ current: 600, savings: 400, net: 1000 });
    expect(await db.transactions.count()).toBe(4);
  });

  it('puts both accounts back exactly as they were when undone', async () => {
    freeze(2026, 7, 10);
    const id = await seed();
    await confirmRecurring(await load(id));

    const r = await load(id);
    await unconfirmRecurring(r, dueDateFor(r, currentMonth()));
    await restartApp();

    expect(await balances()).toEqual({ current: 1000, savings: 0, net: 1000 });
    expect(await db.transactions.count()).toBe(0);
  });

  it('holds the line when two presses race — one transfer, not two', async () => {
    freeze(2026, 7, 10);
    const id = await seed();
    const stale = await load(id);

    // Both callers hold the same pre-settlement snapshot, which is exactly what
    // a double tap gives the screen.
    await Promise.all([confirmRecurring(stale), confirmRecurring(stale)]);
    await restartApp();

    expect(await balances()).toEqual({ current: 800, savings: 200, net: 1000 });
    expect(await db.transactions.count()).toBe(2);
  });

  it('leaves an ordinary charge behaving exactly as before beside it', async () => {
    freeze(2026, 7, 10);
    const transfer = await seed();
    const rent = await createRecurring({
      accountId: 'acc-current',
      direction: 'expense',
      label: 'Loyer',
      amount: 750,
      cadence: 'mensuel',
      icon: 'Home',
      color: '#000',
      dueDay: 5,
    });

    await confirmRecurring(await load(transfer));
    await confirmRecurring(await load(rent));
    await restartApp();

    // Rent leaves the system; the transfer only moves inside it.
    expect(await balances()).toEqual({ current: 50, savings: 200, net: 250 });
  });
});
