// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db/db';
import { useTransaction, useTransfer } from '@/hooks/selectors';
import type { Transaction } from '@/types/models';

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
