// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import { addTransaction, updateTransaction } from '@/lib/transactions';

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
