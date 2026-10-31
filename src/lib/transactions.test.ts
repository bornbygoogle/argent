// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db/db';
import {
  addTransaction,
  addTransfer,
  deleteTransaction,
  deleteTransfer,
  updateTransaction,
} from '@/lib/transactions';
import { confirmRecurring, isConfirmedIn } from '@/lib/recurring';
import type { Recurring } from '@/types/models';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('updateTransaction categoryId', () => {
  // Contract: "Empty string clears it", like subcategoryId and the income
  // sub-type. Absent is a legitimate stored state, resolved to cat-autre at read
  // time, so '' must not be stored as if it were a real category.
  it('clears an empty categoryId to undefined', async () => {
    const id = await addTransaction('expense', {
      amount: 10,
      accountId: 'a1',
      categoryId: 'cat-courses',
    });

    await updateTransaction(id, { categoryId: '' });

    const row = await db.transactions.get(id);
    expect(row?.categoryId).toBeUndefined();
  });

  it('stores a non-empty categoryId', async () => {
    const id = await addTransaction('expense', {
      amount: 10,
      accountId: 'a1',
      categoryId: 'cat-courses',
    });

    await updateTransaction(id, { categoryId: 'cat-loisirs' });

    expect((await db.transactions.get(id))?.categoryId).toBe('cat-loisirs');
  });

  it('leaves categoryId alone when the patch does not mention it', async () => {
    const id = await addTransaction('expense', {
      amount: 10,
      accountId: 'a1',
      categoryId: 'cat-courses',
    });

    await updateTransaction(id, { amount: 12 });

    expect((await db.transactions.get(id))?.categoryId).toBe('cat-courses');
  });
});

const rec = (over: Partial<Recurring> = {}): Recurring => ({
  id: 'r-1',
  accountId: 'acc-1',
  direction: 'expense',
  label: 'Loyer',
  amount: 20,
  cadence: 'mensuel',
  icon: 'Home',
  color: '#000',
  // confirmRecurring settles the earliest unpaid occurrence since creation, so
  // creating the template in August makes August the first instalment.
  createdAt: '2026-08-01T00:00:00.000Z',
  history: [],
  ...over,
});

const loadRec = async (id = 'r-1'): Promise<Recurring> => {
  const r = await db.recurrings.get(id);
  if (!r) throw new Error(`missing recurring ${id}`);
  return r;
};

const forSource = (id = 'r-1') => db.transactions.where('recurringSourceId').equals(id).toArray();

const TODAY = '2026-08-10';

// Contract: a history entry asserts "this instalment was settled by transaction
// X". Deleting X by hand must clear that entry in the same db transaction, so
// the period reopens and no entry names a row that does not exist.
describe('deleteTransaction and the recurring history', () => {
  it('reopens a settled instalment and lets it be logged again exactly once', async () => {
    await db.recurrings.add(rec());
    const txId = await confirmRecurring(await loadRec(), TODAY);
    expect(txId).toBeTruthy();
    expect(isConfirmedIn(await loadRec(), '2026-08')).toBe(true);

    await deleteTransaction(txId as string);

    expect(await db.transactions.get(txId as string)).toBeUndefined();
    expect((await loadRec()).history).toEqual([]);
    expect(isConfirmedIn(await loadRec(), '2026-08')).toBe(false);

    const again = await confirmRecurring(await loadRec(), TODAY);
    expect(again).toBeTruthy();
    expect(again).not.toBe(txId);
    expect(await forSource()).toHaveLength(1);

    // A second press changes nothing: the ceiling holds.
    await confirmRecurring(await loadRec(), TODAY);
    expect(await forSource()).toHaveLength(1);
  });

  it('clears the entry whichever leg of a recurring transfer is deleted', async () => {
    for (const leg of ['in', 'out'] as const) {
      await Promise.all(db.tables.map((t) => t.clear()));
      await db.recurrings.add(rec({ receiverAccountId: 'acc-2' }));
      const outId = await confirmRecurring(await loadRec(), TODAY);
      expect(outId).toBeTruthy();
      const out = await db.transactions.get(outId as string);
      const legs = await db.transactions
        .where('transferGroupId')
        .equals(out?.transferGroupId as string)
        .toArray();
      expect(legs).toHaveLength(2);
      const target = legs.find((l) => l.transferRole === leg);

      await deleteTransaction(target?.id as string);

      expect(await db.transactions.count()).toBe(0);
      expect((await loadRec()).history).toEqual([]);
    }
  });

  it('leaves other entries, other recurrings and unrelated rows alone', async () => {
    await db.recurrings.add(rec({ createdAt: '2026-07-01T00:00:00.000Z' }));
    await db.recurrings.add(rec({ id: 'r-2', label: 'Internet' }));
    const keepId = await confirmRecurring(await loadRec(), TODAY);
    const goneId = await confirmRecurring(await loadRec(), TODAY);
    const otherId = await confirmRecurring(await loadRec('r-2'), TODAY);
    const plainId = await addTransaction('expense', { amount: 5, accountId: 'acc-1' });
    expect(new Set([keepId, goneId, otherId]).size).toBe(3);

    await deleteTransaction(goneId as string);

    expect((await loadRec()).history.map((h) => h.transactionId)).toEqual([keepId]);
    expect((await loadRec('r-2')).history.map((h) => h.transactionId)).toEqual([otherId]);
    expect(await db.transactions.get(keepId as string)).toBeDefined();
    expect(await db.transactions.get(otherId as string)).toBeDefined();
    expect(await db.transactions.get(plainId)).toBeDefined();
  });

  it('deletes just the row when no history names it, touching no recurring', async () => {
    const entry = { month: '2026-08', amount: 20, transactionId: 'other', occurrence: '2026-08-01' };
    await db.recurrings.add(rec({ history: [entry] }));
    const plainId = await addTransaction('expense', { amount: 5, accountId: 'acc-1' });
    const [a, b] = [
      await addTransaction('expense', { amount: 1, accountId: 'acc-1' }),
      await addTransaction('expense', { amount: 2, accountId: 'acc-1' }),
    ];

    await deleteTransaction(plainId);

    expect(await db.transactions.get(plainId)).toBeUndefined();
    expect(await db.transactions.get(a)).toBeDefined();
    expect(await db.transactions.get(b)).toBeDefined();
    expect((await loadRec()).history).toEqual([entry]);
  });

  it('does not delete the row when the history write fails', async () => {
    await db.recurrings.add(rec());
    const txId = (await confirmRecurring(await loadRec(), TODAY)) as string;
    const spy = vi.spyOn(db.recurrings, 'update').mockRejectedValue(new Error('boom'));
    try {
      await expect(deleteTransaction(txId)).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }

    expect(await db.transactions.get(txId)).toBeDefined();
    expect((await loadRec()).history.map((h) => h.transactionId)).toEqual([txId]);
  });
});

describe('deleteTransfer and the recurring history', () => {
  it('clears the entry that names the out leg', async () => {
    await db.recurrings.add(rec({ receiverAccountId: 'acc-2' }));
    const outId = (await confirmRecurring(await loadRec(), TODAY)) as string;
    const out = await db.transactions.get(outId);

    await deleteTransfer(out?.transferGroupId as string);

    expect(await db.transactions.count()).toBe(0);
    expect((await loadRec()).history).toEqual([]);
  });

  it('still deletes a plain transfer that no recurring names', async () => {
    const groupId = await addTransfer({ fromAccountId: 'a1', toAccountId: 'a2', amount: 10 });

    await deleteTransfer(groupId);

    expect(await db.transactions.count()).toBe(0);
  });
});
