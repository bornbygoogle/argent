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

  it('never reaches back past the template’s own creation', async () => {
    await db.transactions.add(tx('tx-1', '2026-07-10'));
    await db.recurrings.add(
      rec({
        createdAt: '2026-07-01T00:00:00.000Z',
        dueDay: 30,
        history: [{ month: '2026-07', amount: 20, transactionId: 'tx-1' }],
      }),
    );

    await backfillOccurrences();

    // June predates the template, so the entry keeps its old meaning.
    expect((await load()).history[0].occurrence).toBe('2026-07-30');
  });

  it('falls back to the month’s due date when the transaction is gone', async () => {
    await db.recurrings.add(
      rec({ dueDay: 30, history: [{ month: '2026-07', amount: 20, transactionId: 'missing' }] }),
    );

    await backfillOccurrences();

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
