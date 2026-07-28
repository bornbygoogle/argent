// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import { backfillOccurrences } from '@/lib/recurringMigration';
import { isConfirmedIn } from '@/lib/recurring';
import type { Recurring, Transaction } from '@/types/models';

const rec = (over: Partial<Recurring> = {}): Recurring => ({
  id: 'r-1',
  accountId: 'acc-1',
  direction: 'expense',
  label: 'Loyer',
  amount: 20,
  cadence: 'mensuel',
  icon: 'Home',
  color: '#000',
  createdAt: '2026-01-01T00:00:00.000Z',
  history: [],
  ...over,
});

const tx = (id: string, date: string): Transaction => ({
  id,
  kind: 'expense',
  accountId: 'acc-1',
  amount: 20,
  date,
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: `${date}T10:00:00.000Z`,
});

const load = async (id = 'r-1') => {
  const r = await db.recurrings.get(id);
  if (!r) throw new Error('missing');
  return r;
};

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('backfillOccurrences', () => {
  it('reads a payment logged before the due day as settling the previous instalment', async () => {
    // Logged 10 July, due on the 30th → it was June's bill being paid.
    await db.transactions.add(tx('tx-1', '2026-07-10'));
    await db.recurrings.add(
      rec({ dueDay: 30, history: [{ month: '2026-07', amount: 20, transactionId: 'tx-1' }] }),
    );

    expect(await backfillOccurrences()).toBe(1);

    const r = await load();
    expect(r.history[0].occurrence).toBe('2026-06-30');
    expect(r.history[0].month).toBe('2026-07'); // never rewritten
    // …so July's instalment is outstanding again.
    expect(isConfirmedIn(r, '2026-07')).toBe(false);
    expect(isConfirmedIn(r, '2026-06')).toBe(true);
  });

  it('leaves a payment logged on its due day settling that same instalment', async () => {
    await db.transactions.add(tx('tx-1', '2026-07-30'));
    await db.recurrings.add(
      rec({ dueDay: 30, history: [{ month: '2026-07', amount: 20, transactionId: 'tx-1' }] }),
    );

    await backfillOccurrences();

    const r = await load();
    expect(r.history[0].occurrence).toBe('2026-07-30');
    expect(isConfirmedIn(r, '2026-07')).toBe(true);
  });

  it('changes nothing for a template with no due day', async () => {
    await db.transactions.add(tx('tx-1', '2026-07-10'));
    await db.recurrings.add(
      rec({ history: [{ month: '2026-07', amount: 20, transactionId: 'tx-1' }] }),
    );

    await backfillOccurrences();

    const r = await load();
    expect(r.history[0].occurrence).toBe('2026-07-01');
    expect(isConfirmedIn(r, '2026-07')).toBe(true);
  });

  it('reaches back past the template’s creation date, which is only when it was typed in', async () => {
    // Real shape: every template entered on 5 July, bills paid days later,
    // due days set afterwards. createdAt is when the row was created in the
    // app — the bill itself is older, so its June instalment is real.
    await db.transactions.add(tx('tx-1', '2026-07-06'));
    await db.recurrings.add(
      rec({
        createdAt: '2026-07-05T22:36:21.684Z',
        dueDay: 28,
        history: [{ month: '2026-07', amount: 20, transactionId: 'tx-1' }],
      }),
    );

    await backfillOccurrences();

    const r = await load();
    expect(r.history[0].occurrence).toBe('2026-06-28');
    // A payment made on the 6th cannot have settled a bill due on the 28th.
    expect(isConfirmedIn(r, '2026-07')).toBe(false);
  });

  it('still settles the current instalment when the payment came after its due day', async () => {
    await db.transactions.add(tx('tx-1', '2026-07-10'));
    await db.recurrings.add(
      rec({
        createdAt: '2026-07-05T00:00:00.000Z',
        dueDay: 10,
        history: [{ month: '2026-07', amount: 20, transactionId: 'tx-1' }],
      }),
    );

    await backfillOccurrences();

    const r = await load();
    expect(r.history[0].occurrence).toBe('2026-07-10');
    expect(isConfirmedIn(r, '2026-07')).toBe(true);
  });

  it('falls back to the month’s due date when the transaction is gone', async () => {
    await db.recurrings.add(
      rec({ dueDay: 30, history: [{ month: '2026-07', amount: 20, transactionId: 'missing' }] }),
    );

    await backfillOccurrences();

    expect((await load()).history[0].occurrence).toBe('2026-07-30');
  });

  it('repairs an entry already stamped with an instalment later than its payment', async () => {
    // Exactly what the first, guarded backfill produced: paid on the 6th,
    // stamped as settling the 28th. A payment cannot settle a later instalment.
    await db.transactions.add(tx('tx-1', '2026-07-06'));
    await db.recurrings.add(
      rec({
        createdAt: '2026-07-05T22:36:21.684Z',
        dueDay: 28,
        history: [
          { month: '2026-07', amount: 20, transactionId: 'tx-1', occurrence: '2026-07-28' },
        ],
      }),
    );

    expect(await backfillOccurrences()).toBe(1);

    const r = await load();
    expect(r.history[0].occurrence).toBe('2026-06-28');
    expect(isConfirmedIn(r, '2026-07')).toBe(false);
  });

  it('leaves an early settlement alone, where payment and instalment match', async () => {
    // confirmRecurring dates the transaction on the instalment it settles, so
    // paying ahead of the due day is not misattribution.
    await db.transactions.add(tx('tx-1', '2026-07-30'));
    await db.recurrings.add(
      rec({
        dueDay: 30,
        history: [
          { month: '2026-07', amount: 20, transactionId: 'tx-1', occurrence: '2026-07-30' },
        ],
      }),
    );

    expect(await backfillOccurrences()).toBe(0);
    expect((await load()).history[0].occurrence).toBe('2026-07-30');
  });

  it('is idempotent — a second run writes nothing', async () => {
    await db.transactions.add(tx('tx-1', '2026-07-10'));
    await db.recurrings.add(
      rec({ dueDay: 30, history: [{ month: '2026-07', amount: 20, transactionId: 'tx-1' }] }),
    );

    expect(await backfillOccurrences()).toBe(1);
    expect(await backfillOccurrences()).toBe(0);
    expect((await load()).history[0].occurrence).toBe('2026-06-30');
  });
});
