// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before '@/db/db' — that module constructs the Dexie instance at load time.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import {
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  listSubcategories,
  ensureSubcategory,
} from '@/lib/subcategories';
import { deleteCategory } from '@/lib/categories';
import { addTransaction, updateTransaction } from '@/lib/transactions';
import type { Category } from '@/types/models';

const category = (id: string, name: string, sortOrder: number): Category => ({
  id,
  name,
  icon: 'ShoppingCart',
  color: '#3F8F6B',
  isDefault: false,
  sortOrder,
});

beforeEach(async () => {
  await db.transaction(
    'rw',
    [db.categories, db.subcategories, db.transactions, db.budgets],
    async () => {
      await db.categories.clear();
      await db.subcategories.clear();
      await db.transactions.clear();
      await db.budgets.clear();
      await db.categories.bulkAdd([
        category('cat-restaurant', 'Restaurant', 0),
        category('cat-courses', 'Courses', 1),
        category('cat-autre', 'Autre', 2),
      ]);
    },
  );
});

describe('createSubcategory', () => {
  it('stores the sub-category against its parent category', async () => {
    const id = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    const row = await db.subcategories.get(id);
    expect(row).toMatchObject({ categoryId: 'cat-restaurant', name: 'Midi', sortOrder: 0 });
  });

  it('appends, numbering sortOrder within each category independently', async () => {
    await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    await createSubcategory({ categoryId: 'cat-restaurant', name: 'Soir' });
    const first = await createSubcategory({ categoryId: 'cat-courses', name: 'Bio' });

    const resto = await listSubcategories('cat-restaurant');
    expect(resto.map((s) => [s.name, s.sortOrder])).toEqual([
      ['Midi', 0],
      ['Soir', 1],
    ]);
    // A second category starts its own numbering at 0.
    expect((await db.subcategories.get(first))?.sortOrder).toBe(0);
  });

  it('trims the name', async () => {
    const id = await createSubcategory({ categoryId: 'cat-restaurant', name: '  Livraison  ' });
    expect((await db.subcategories.get(id))?.name).toBe('Livraison');
  });

  it('refuses a blank name — "Restaurant()" is not a label', async () => {
    await expect(createSubcategory({ categoryId: 'cat-restaurant', name: '   ' })).rejects.toThrow();
    expect(await db.subcategories.count()).toBe(0);
  });
});

describe('listSubcategories', () => {
  it('returns only the given category, ordered by sortOrder', async () => {
    await createSubcategory({ categoryId: 'cat-courses', name: 'Bio' });
    await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    await createSubcategory({ categoryId: 'cat-courses', name: 'Marché' });

    expect((await listSubcategories('cat-courses')).map((s) => s.name)).toEqual(['Bio', 'Marché']);
  });

  it('returns an empty list for a category with none', async () => {
    expect(await listSubcategories('cat-autre')).toEqual([]);
  });
});

describe('updateSubcategory', () => {
  it('renames, trimming the input', async () => {
    const id = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    await updateSubcategory(id, { name: '  Déjeuner ' });
    expect((await db.subcategories.get(id))?.name).toBe('Déjeuner');
  });

  it('leaves the name alone when handed a blank one', async () => {
    const id = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    await updateSubcategory(id, { name: '  ' });
    expect((await db.subcategories.get(id))?.name).toBe('Midi');
  });
});

describe('ensureSubcategory', () => {
  it('creates the sub-category when the category has no match', async () => {
    const id = await ensureSubcategory('cat-restaurant', 'Lunch');
    expect((await db.subcategories.get(id))?.name).toBe('Lunch');
    expect(await db.subcategories.count()).toBe(1);
  });

  it('reuses an existing name instead of creating a duplicate', async () => {
    const first = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Lunch' });
    const again = await ensureSubcategory('cat-restaurant', 'Lunch');
    expect(again).toBe(first);
    expect(await db.subcategories.count()).toBe(1);
  });

  it('matches regardless of case and surrounding space', async () => {
    const first = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Lunch' });
    expect(await ensureSubcategory('cat-restaurant', '  lUNCh ')).toBe(first);
    expect(await db.subcategories.count()).toBe(1);
  });

  it('keeps the name the user first chose when reusing', async () => {
    const first = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Lunch' });
    await ensureSubcategory('cat-restaurant', 'LUNCH');
    expect((await db.subcategories.get(first))?.name).toBe('Lunch');
  });

  it('only matches within the same category', async () => {
    const resto = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Lunch' });
    const courses = await ensureSubcategory('cat-courses', 'Lunch');
    expect(courses).not.toBe(resto);
    expect((await db.subcategories.get(courses))?.categoryId).toBe('cat-courses');
  });

  it('refuses a blank name', async () => {
    await expect(ensureSubcategory('cat-restaurant', '  ')).rejects.toThrow();
    expect(await db.subcategories.count()).toBe(0);
  });
});

describe('deleteSubcategory', () => {
  it('removes the row and detaches it from its transactions, keeping the category', async () => {
    const subId = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    const txId = await addTransaction('expense', {
      amount: 12,
      accountId: 'acc-1',
      categoryId: 'cat-restaurant',
      subcategoryId: subId,
    });

    await deleteSubcategory(subId);

    expect(await db.subcategories.get(subId)).toBeUndefined();
    const tx = await db.transactions.get(txId);
    expect(tx?.categoryId).toBe('cat-restaurant');
    expect(tx?.subcategoryId).toBeUndefined();
  });

  it('leaves transactions of sibling sub-categories untouched', async () => {
    const doomed = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    const kept = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Soir' });
    const txId = await addTransaction('expense', {
      amount: 30,
      accountId: 'acc-1',
      categoryId: 'cat-restaurant',
      subcategoryId: kept,
    });

    await deleteSubcategory(doomed);

    expect((await db.transactions.get(txId))?.subcategoryId).toBe(kept);
  });
});

describe('deleteCategory cascade', () => {
  it('deletes the category sub-categories and clears them off reassigned expenses', async () => {
    const subId = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    const txId = await addTransaction('expense', {
      amount: 20,
      accountId: 'acc-1',
      categoryId: 'cat-restaurant',
      subcategoryId: subId,
    });

    await deleteCategory('cat-restaurant');

    expect(await listSubcategories('cat-restaurant')).toEqual([]);
    const tx = await db.transactions.get(txId);
    // The expense survives under the fallback category, but its sub-category
    // belonged to the deleted parent and cannot follow it there.
    expect(tx?.categoryId).toBe('cat-autre');
    expect(tx?.subcategoryId).toBeUndefined();
  });

  it('leaves another category sub-categories alone', async () => {
    await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    await createSubcategory({ categoryId: 'cat-courses', name: 'Bio' });

    await deleteCategory('cat-restaurant');

    expect((await listSubcategories('cat-courses')).map((s) => s.name)).toEqual(['Bio']);
  });
});

describe('transaction writes', () => {
  it('stores the sub-category on a new expense', async () => {
    const subId = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    const txId = await addTransaction('expense', {
      amount: 9,
      accountId: 'acc-1',
      categoryId: 'cat-restaurant',
      subcategoryId: subId,
    });
    expect((await db.transactions.get(txId))?.subcategoryId).toBe(subId);
  });

  it('never stores a sub-category on income', async () => {
    const subId = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    const txId = await addTransaction('income', {
      amount: 100,
      accountId: 'acc-1',
      incomeType: 'Salaire',
      subcategoryId: subId,
    });
    expect((await db.transactions.get(txId))?.subcategoryId).toBeUndefined();
  });

  it('drops a stale sub-category when the category changes', async () => {
    const subId = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    const txId = await addTransaction('expense', {
      amount: 9,
      accountId: 'acc-1',
      categoryId: 'cat-restaurant',
      subcategoryId: subId,
    });

    await updateTransaction(txId, { categoryId: 'cat-courses' });

    expect((await db.transactions.get(txId))?.subcategoryId).toBeUndefined();
  });

  it('keeps a sub-category supplied alongside its own category', async () => {
    const midi = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    const bio = await createSubcategory({ categoryId: 'cat-courses', name: 'Bio' });
    const txId = await addTransaction('expense', {
      amount: 9,
      accountId: 'acc-1',
      categoryId: 'cat-restaurant',
      subcategoryId: midi,
    });

    await updateTransaction(txId, { categoryId: 'cat-courses', subcategoryId: bio });

    const tx = await db.transactions.get(txId);
    expect(tx?.categoryId).toBe('cat-courses');
    expect(tx?.subcategoryId).toBe(bio);
  });

  it('clears the sub-category when explicitly emptied', async () => {
    const subId = await createSubcategory({ categoryId: 'cat-restaurant', name: 'Midi' });
    const txId = await addTransaction('expense', {
      amount: 9,
      accountId: 'acc-1',
      categoryId: 'cat-restaurant',
      subcategoryId: subId,
    });

    await updateTransaction(txId, { subcategoryId: '' });

    expect((await db.transactions.get(txId))?.subcategoryId).toBeUndefined();
  });
});
