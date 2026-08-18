import { describe, it, expect } from 'vitest';
import { bySubcategory, filterByCategory, UNSPECIFIED_SUB } from '@/lib/stats';
import type { Transaction, TransactionKind } from '@/types/models';

const tx = (
  id: string,
  amount: number,
  over: Partial<Transaction> = {},
): Transaction => ({
  id,
  kind: 'expense' as TransactionKind,
  accountId: 'acc-1',
  amount,
  date: '2026-08-10',
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  ...over,
});

describe('bySubcategory', () => {
  it('groups a category\'s expenses by sub-category, largest first', () => {
    const slices = bySubcategory(
      [
        tx('t1', 10, { categoryId: 'cat-resto', subcategoryId: 'sub-midi' }),
        tx('t2', 30, { categoryId: 'cat-resto', subcategoryId: 'sub-livraison' }),
        tx('t3', 20, { categoryId: 'cat-resto', subcategoryId: 'sub-midi' }),
      ],
      'cat-resto',
    );

    expect(slices).toEqual([
      { subcategoryId: 'sub-midi', total: 30, share: 0.5 },
      { subcategoryId: 'sub-livraison', total: 30, share: 0.5 },
    ]);
  });

  it('collapses expenses carrying no sub-category into a single null slice', () => {
    const slices = bySubcategory(
      [
        tx('t1', 10, { categoryId: 'cat-resto' }),
        tx('t2', 5, { categoryId: 'cat-resto' }),
        tx('t3', 40, { categoryId: 'cat-resto', subcategoryId: 'sub-midi' }),
      ],
      'cat-resto',
    );

    expect(slices).toEqual([
      { subcategoryId: 'sub-midi', total: 40, share: 0.7272727272727273 },
      { subcategoryId: null, total: 15, share: 0.2727272727272727 },
    ]);
  });

  it('ignores other categories and non-expense movements', () => {
    const slices = bySubcategory(
      [
        tx('t1', 10, { categoryId: 'cat-resto', subcategoryId: 'sub-midi' }),
        tx('t2', 99, { categoryId: 'cat-courses', subcategoryId: 'sub-bio' }),
        tx('t3', 99, { kind: 'income', categoryId: 'cat-resto', subcategoryId: 'sub-midi' }),
        tx('t4', 99, { kind: 'transfer', categoryId: 'cat-resto' }),
      ],
      'cat-resto',
    );

    expect(slices).toEqual([{ subcategoryId: 'sub-midi', total: 10, share: 1 }]);
  });

  it('returns no slices when the category has no spend', () => {
    expect(bySubcategory([tx('t1', 10, { categoryId: 'cat-courses' })], 'cat-resto')).toEqual([]);
  });
});

describe('filterByCategory', () => {
  const all = [
    tx('t1', 10, { categoryId: 'cat-resto', subcategoryId: 'sub-midi' }),
    tx('t2', 20, { categoryId: 'cat-resto', subcategoryId: 'sub-livraison' }),
    tx('t3', 30, { categoryId: 'cat-resto' }),
    tx('t4', 40, { categoryId: 'cat-courses', subcategoryId: 'sub-bio' }),
    tx('t5', 50, {}),
  ];
  const ids = (ts: Transaction[]) => ts.map((t) => t.id);

  it('keeps everything when no category is chosen', () => {
    expect(ids(filterByCategory(all))).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });

  it('keeps only the chosen category', () => {
    expect(ids(filterByCategory(all, 'cat-resto'))).toEqual(['t1', 't2', 't3']);
  });

  it('narrows to one sub-category of the chosen category', () => {
    expect(ids(filterByCategory(all, 'cat-resto', 'sub-midi'))).toEqual(['t1']);
  });

  it('keeps only the category\'s unclassified spend for the unspecified bucket', () => {
    expect(ids(filterByCategory(all, 'cat-resto', UNSPECIFIED_SUB))).toEqual(['t3']);
  });
});
