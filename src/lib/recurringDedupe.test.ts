// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import { dedupeRecurringMonths } from '@/lib/recurringDedupe';
import type { Recurring, RecurringHistoryEntry, Transaction } from '@/types/models';

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

/** A settled instalment: the transaction plus the history entry naming it. */
const tx = (
  id: string,
  date: string,
  savedAt: string,
  sourceId = 'r-1',
): Transaction => ({
  id,
  kind: 'expense',
  accountId: 'acc-1',
  amount: 20,
  date,
  recurringSourceId: sourceId,
  createdAt: savedAt,
  updatedAt: savedAt,
});

const entry = (id: string, occurrence: string): RecurringHistoryEntry => ({
  month: occurrence.slice(0, 7),
  amount: 20,
  transactionId: id,
  occurrence,
});

const load = async (id = 'r-1') => {
  const r = await db.recurrings.get(id);
  if (!r) throw new Error('missing');
  return r;
};

const ids = async () => (await db.transactions.toArray()).map((t) => t.id).sort();

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('dedupeRecurringMonths', () => {
  it('keeps the oldest and the latest by saved date, deleting what sits between', async () => {
    await db.transactions.bulkAdd([
      tx('tx-1', '2026-08-05', '2026-08-01T10:00:00.000Z'),
      tx('tx-2', '2026-08-10', '2026-08-02T10:00:00.000Z'),
      tx('tx-3', '2026-08-15', '2026-08-03T10:00:00.000Z'),
      tx('tx-4', '2026-08-20', '2026-08-04T10:00:00.000Z'),
    ]);
    await db.recurrings.add(rec({ history: [] }));

    expect(await dedupeRecurringMonths()).toBe(2);
    expect(await ids()).toEqual(['tx-1', 'tx-4']);
  });

  it('ranks by saved date, not by the instalment date', async () => {
    // Saved newest-first: the row dated the 20th was entered before the others.
    await db.transactions.bulkAdd([
      tx('tx-late', '2026-08-20', '2026-08-01T10:00:00.000Z'),
      tx('tx-mid', '2026-08-10', '2026-08-02T10:00:00.000Z'),
      tx('tx-early', '2026-08-05', '2026-08-03T10:00:00.000Z'),
    ]);
    await db.recurrings.add(rec());

    expect(await dedupeRecurringMonths()).toBe(1);
    expect(await ids()).toEqual(['tx-early', 'tx-late']);
  });

  it('breaks a saved-date tie deterministically rather than by table order', async () => {
    // The concurrent-press race stamps every row the same millisecond.
    const same = '2026-08-01T10:00:00.000Z';
    await db.transactions.bulkAdd([
      tx('tx-b', '2026-08-05', same),
      tx('tx-c', '2026-08-05', same),
      tx('tx-a', '2026-08-05', same),
    ]);
    await db.recurrings.add(rec());

    expect(await dedupeRecurringMonths()).toBe(1);
    expect(await ids()).toEqual(['tx-a', 'tx-c']);
  });

  it('leaves a month holding exactly two alone', async () => {
    await db.transactions.bulkAdd([
      tx('tx-1', '2026-08-05', '2026-08-01T10:00:00.000Z'),
      tx('tx-2', '2026-08-20', '2026-08-02T10:00:00.000Z'),
    ]);
    await db.recurrings.add(rec());

    expect(await dedupeRecurringMonths()).toBe(0);
    expect(await ids()).toEqual(['tx-1', 'tx-2']);
  });

  it('leaves a month holding one alone', async () => {
    await db.transactions.add(tx('tx-1', '2026-08-05', '2026-08-01T10:00:00.000Z'));
    await db.recurrings.add(rec());

    expect(await dedupeRecurringMonths()).toBe(0);
    expect(await ids()).toEqual(['tx-1']);
  });

  it('weighs each month on its own', async () => {
    await db.transactions.bulkAdd([
      tx('jul-1', '2026-07-05', '2026-07-01T10:00:00.000Z'),
      tx('aug-1', '2026-08-05', '2026-08-01T10:00:00.000Z'),
      tx('aug-2', '2026-08-10', '2026-08-02T10:00:00.000Z'),
      tx('aug-3', '2026-08-15', '2026-08-03T10:00:00.000Z'),
    ]);
    await db.recurrings.add(rec());

    expect(await dedupeRecurringMonths()).toBe(1);
    expect(await ids()).toEqual(['aug-1', 'aug-3', 'jul-1']);
  });

  it('weighs each template on its own', async () => {
    // Two templates, two instalments each in the same month — nothing is over.
    await db.transactions.bulkAdd([
      tx('a-1', '2026-08-05', '2026-08-01T10:00:00.000Z', 'r-1'),
      tx('a-2', '2026-08-10', '2026-08-02T10:00:00.000Z', 'r-1'),
      tx('b-1', '2026-08-05', '2026-08-03T10:00:00.000Z', 'r-2'),
      tx('b-2', '2026-08-10', '2026-08-04T10:00:00.000Z', 'r-2'),
    ]);
    await db.recurrings.bulkAdd([rec({ id: 'r-1' }), rec({ id: 'r-2', label: 'Internet' })]);

    expect(await dedupeRecurringMonths()).toBe(0);
    expect(await ids()).toEqual(['a-1', 'a-2', 'b-1', 'b-2']);
  });

  it('ignores transactions that no template claims', async () => {
    await db.transactions.bulkAdd([
      { ...tx('free-1', '2026-08-05', '2026-08-01T10:00:00.000Z'), recurringSourceId: undefined },
      { ...tx('free-2', '2026-08-06', '2026-08-02T10:00:00.000Z'), recurringSourceId: undefined },
      { ...tx('free-3', '2026-08-07', '2026-08-03T10:00:00.000Z'), recurringSourceId: undefined },
    ]);
    await db.recurrings.add(rec());

    expect(await dedupeRecurringMonths()).toBe(0);
    expect(await ids()).toEqual(['free-1', 'free-2', 'free-3']);
  });

  it('drops the history entries of the transactions it deleted, and only those', async () => {
    await db.transactions.bulkAdd([
      tx('tx-1', '2026-08-05', '2026-08-01T10:00:00.000Z'),
      tx('tx-2', '2026-08-10', '2026-08-02T10:00:00.000Z'),
      tx('tx-3', '2026-08-20', '2026-08-03T10:00:00.000Z'),
    ]);
    await db.recurrings.add(
      rec({
        history: [
          entry('tx-1', '2026-08-05'),
          entry('tx-2', '2026-08-10'),
          entry('tx-3', '2026-08-20'),
        ],
      }),
    );

    expect(await dedupeRecurringMonths()).toBe(1);
    expect((await load()).history.map((h) => h.transactionId)).toEqual(['tx-1', 'tx-3']);
  });

  it('leaves a history entry whose transaction the user deleted by hand', async () => {
    // Nothing here is over the ceiling, so the pass must not touch history at
    // all. Dropping such an entry would reopen a settled month and invite a
    // fresh duplicate — the very thing this pass exists to stop.
    await db.transactions.add(tx('tx-1', '2026-08-05', '2026-08-01T10:00:00.000Z'));
    await db.recurrings.add(
      rec({ history: [entry('tx-1', '2026-08-05'), entry('tx-gone', '2026-07-05')] }),
    );

    expect(await dedupeRecurringMonths()).toBe(0);
    expect((await load()).history).toHaveLength(2);
  });

  it('sweeps the orphans the concurrent-press race left behind', async () => {
    // Three transactions written, one history entry: the losing writes were
    // overwritten, so the UI has no way to un-log them.
    const same = '2026-08-01T10:00:00.000Z';
    await db.transactions.bulkAdd([
      tx('tx-a', '2026-08-05', same),
      tx('tx-b', '2026-08-05', same),
      tx('tx-c', '2026-08-05', same),
    ]);
    await db.recurrings.add(rec({ history: [entry('tx-c', '2026-08-05')] }));

    expect(await dedupeRecurringMonths()).toBe(1);
    expect(await ids()).toEqual(['tx-a', 'tx-c']);
    expect((await load()).history.map((h) => h.transactionId)).toEqual(['tx-c']);
  });

  it('is idempotent — a second run writes nothing', async () => {
    await db.transactions.bulkAdd([
      tx('tx-1', '2026-08-05', '2026-08-01T10:00:00.000Z'),
      tx('tx-2', '2026-08-10', '2026-08-02T10:00:00.000Z'),
      tx('tx-3', '2026-08-15', '2026-08-03T10:00:00.000Z'),
      tx('tx-4', '2026-08-20', '2026-08-04T10:00:00.000Z'),
    ]);
    await db.recurrings.add(rec());

    expect(await dedupeRecurringMonths()).toBe(2);
    expect(await dedupeRecurringMonths()).toBe(0);
    expect(await ids()).toEqual(['tx-1', 'tx-4']);
  });

  it('changes nothing on a clean database', async () => {
    expect(await dedupeRecurringMonths()).toBe(0);
  });
});
