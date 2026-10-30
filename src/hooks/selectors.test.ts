// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db/db';
import { useCategories, useIncomeTypes, useTransaction, useTransfer } from '@/hooks/selectors';
import type { Category, IncomeType, Transaction } from '@/types/models';

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  kind: 'expense',
  accountId: 'acc-1',
  amount: 10,
  date: '2026-07-27',
  createdAt: '2026-07-27T10:00:00.000Z',
  updatedAt: '2026-07-27T10:00:00.000Z',
  ...over,
});

beforeEach(async () => {
  await db.transactions.clear();
  await db.transactions.bulkAdd([
    tx(),
    tx({ id: 'leg-out', kind: 'transfer', transferGroupId: 'grp-1', transferRole: 'out' }),
    tx({ id: 'leg-in', kind: 'transfer', transferGroupId: 'grp-1', transferRole: 'in' }),
  ]);
});

// A screen that cannot tell "still loading" from "does not exist" either spins
// forever or renders an editable form for a record that isn't there. Both are
// real screens in this app, so the distinction belongs in the selector.
describe('useTransaction', () => {
  it('is undefined while the query is in flight', () => {
    const { result } = renderHook(() => useTransaction('tx-1'));
    expect(result.current).toBeUndefined();
  });

  it('resolves to the record when it exists', async () => {
    const { result } = renderHook(() => useTransaction('tx-1'));
    await waitFor(() => expect(result.current).toMatchObject({ id: 'tx-1', amount: 10 }));
  });

  it('resolves to null — not undefined — when the id does not exist', async () => {
    const { result } = renderHook(() => useTransaction('nope'));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('resolves to null when no id was given at all', async () => {
    const { result } = renderHook(() => useTransaction(undefined));
    await waitFor(() => expect(result.current).toBeNull());
  });
});

describe('useTransfer', () => {
  it('is undefined while the query is in flight', () => {
    const { result } = renderHook(() => useTransfer('grp-1'));
    expect(result.current).toBeUndefined();
  });

  it('resolves to both legs when the group exists', async () => {
    const { result } = renderHook(() => useTransfer('grp-1'));
    await waitFor(() => expect(result.current).toHaveLength(2));
  });

  it('resolves to an empty array — not undefined — when the group does not exist', async () => {
    const { result } = renderHook(() => useTransfer('nope'));
    await waitFor(() => expect(result.current).toEqual([]));
  });
});

// useLiveQuery owns the array its querier returns; a selector that sorts it in
// place reorders a reference other consumers may hold.
describe('selectors do not mutate the live-query array', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('useCategories does not mutate the array returned by the live query', async () => {
    const source = [
      { id: 'c', sortOrder: 3 },
      { id: 'a', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
    ] as unknown as Category[];
    const before = source.map((c) => c.id);
    vi.spyOn(db.categories, 'toArray').mockResolvedValue(source);

    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current.map((c) => c.id)).toEqual(['a', 'b', 'c']));

    expect(source.map((c) => c.id)).toEqual(before);
    expect(result.current).not.toBe(source);
  });

  it('useIncomeTypes does not mutate the array returned by the live query', async () => {
    const source = [
      { key: 'c', order: 3 },
      { key: 'a', order: 1 },
      { key: 'b', order: 2 },
    ] as unknown as IncomeType[];
    const before = source.map((t) => t.key);
    vi.spyOn(db.incomeTypes, 'toArray').mockResolvedValue(source);

    const { result } = renderHook(() => useIncomeTypes());
    await waitFor(() => expect(result.current.map((t) => t.key)).toEqual(['a', 'b', 'c']));

    expect(source.map((t) => t.key)).toEqual(before);
    expect(result.current).not.toBe(source);
  });
});
