// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import { backfillOccurrences } from '@/lib/recurringMigration';
import { confirmRecurring, isConfirmedIn } from '@/lib/recurring';
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
  it('settles the payment’s own month even when it came before the due day', async () => {
    // Logged 10 July, due on the 30th. Whichever bill the user had in mind, the
    // money left in July and July is where the app counts it.
    await db.transactions.add(tx('tx-1', '2026-07-10'));
    await db.recurrings.add(
      rec({ dueDay: 30, history: [{ month: '2026-07', amount: 20, transactionId: 'tx-1' }] }),
    );

    expect(await backfillOccurrences()).toBe(1);

    const r = await load();
    expect(r.history[0].occurrence).toBe('2026-07-30');
    expect(r.history[0].month).toBe('2026-07'); // never rewritten
    expect(isConfirmedIn(r, '2026-07')).toBe(true);
    expect(isConfirmedIn(r, '2026-06')).toBe(false);
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

  it('keeps a payment made days after the template was typed in inside its own month', async () => {
    // Real shape: every template entered on 5 July, bills paid days later, due
    // days set afterwards. Reaching back to a June instalment here would strand
    // the July transaction in a month reading unpaid.
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
    expect(r.history[0].occurrence).toBe('2026-07-28');
    expect(isConfirmedIn(r, '2026-07')).toBe(true);
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

  it('leaves an instalment later in the month than its payment alone', async () => {
    // Paid on the 6th, stamped as settling the 28th. Same month, so the money
    // and the instalment agree and there is nothing to repair.
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

    expect(await backfillOccurrences()).toBe(0);

    const r = await load();
    expect(r.history[0].occurrence).toBe('2026-07-28');
    expect(isConfirmedIn(r, '2026-07')).toBe(true);
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
    expect((await load()).history[0].occurrence).toBe('2026-07-30');
  });
});

// The live rows that jammed: on 2 September 2026 three templates — Bouygues and
// the two "Garantie décès" — refused every press with "this month already holds
// an entry", and had done since July. Each carried one history entry stamped
// with a June instalment against a transaction dated in July: paidMonths said
// July was owed, the ceiling counted the July transaction and refused, and the
// month could never advance. An instalment is settled by money that moved, so
// its occurrence belongs in the month that money moved in.
describe('an entry stamped with an instalment from a month its payment is not in', () => {
  const jammed = async () => {
    await db.transactions.add({ ...tx('tx-1', '2026-07-06'), recurringSourceId: 'r-1' });
    await db.recurrings.add(
      rec({
        label: 'Bouygues',
        createdAt: '2026-07-05T22:37:21.576Z',
        dueDay: 30,
        history: [
          { month: '2026-07', amount: 20, transactionId: 'tx-1', occurrence: '2026-06-30' },
        ],
      }),
    );
  };

  it('is repaired onto the instalment of the month the payment sits in', async () => {
    await jammed();

    expect(await backfillOccurrences()).toBe(1);

    const r = await load();
    expect(r.history[0].occurrence).toBe('2026-07-30');
    expect(isConfirmedIn(r, '2026-07')).toBe(true);
    expect(isConfirmedIn(r, '2026-06')).toBe(false);
  });

  it('lets the months since it be logged again', async () => {
    await jammed();
    await backfillOccurrences();

    const txId = await confirmRecurring(await load(), '2026-09-02');

    expect(txId).not.toBeNull();
    expect((await db.transactions.get(txId!))?.date).toBe('2026-08-30');
  });
});
