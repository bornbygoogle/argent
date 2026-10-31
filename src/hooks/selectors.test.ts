// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before anything that pulls in '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db/db';
import {
  resolveOwed,
  useCategories,
  useIncomeTypes,
  useOwedRecurrings,
  useTransaction,
  useTransfer,
} from '@/hooks/selectors';
import type { Account, Category, IncomeType, Recurring, Transaction } from '@/types/models';

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

const template = (over: Partial<Recurring> = {}): Recurring => ({
  id: 'r-1',
  accountId: 'acc-1',
  direction: 'expense',
  label: 'Loyer',
  amount: 900,
  cadence: 'mensuel',
  icon: 'Home',
  color: '#7C3AED',
  createdAt: '2026-06-27T12:00:00',
  history: [],
  ...over,
});

const bank = (id: string, order: number): Account => ({
  id,
  name: id,
  type: 'courant',
  color: '#2B2823',
  icon: 'Wallet',
  openingBalance: 0,
  order,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

// "What is owed" is derived once here and read by the Dashboard, the Recurring
// page and Settings — so the pay-cycle rule lives in exactly one place.
describe('resolveOwed', () => {
  // Cycles opened on 26 Jun and 26 Jul; today is in the 26 Jul cycle.
  const salaries = ['2026-06-26', '2026-07-26'];
  const today = '2026-08-10';

  it('owes a passed pay cycle that is still unfilled, dated inside that cycle', () => {
    // Only the CURRENT cycle (26 Jul →) holds an instalment: the 26 Jun cycle,
    // already behind us, is still owed.
    const paidNow = template({
      history: [{ month: '2026-08', amount: 900, transactionId: 't-1', occurrence: '2026-08-05' }],
    });

    const [entry] = resolveOwed([paidNow], today, salaries);

    expect(entry.status).toBe('owed');
    expect(entry.occurrence >= '2026-06-26' && entry.occurrence < '2026-07-26').toBe(true);
  });

  it('settles a template once every cycle up to now holds its instalment', () => {
    const paid = template({
      history: [
        { month: '2026-07', amount: 900, transactionId: 't-1', occurrence: '2026-07-05' },
        { month: '2026-08', amount: 900, transactionId: 't-2', occurrence: '2026-08-05' },
      ],
    });

    const [entry] = resolveOwed([paid], today, salaries);

    expect(entry.status).toBe('settled');
  });

  it('does not owe a yearly expense outside its anniversary month', () => {
    const yearly = template({
      cadence: 'annuel',
      dueDay: 15,
      createdAt: '2026-03-10T12:00:00',
    });

    expect(resolveOwed([yearly], '2026-08-10', [])[0].status).toBe('idle');
    expect(resolveOwed([yearly], '2026-12-01', [])[0].status).toBe('idle');
  });

  it('owes a yearly expense in its anniversary month, and settles it once paid', () => {
    const base = template({
      cadence: 'annuel',
      dueDay: 15,
      createdAt: '2026-03-10T12:00:00',
    });
    const paid2026 = {
      month: '2026-03',
      amount: 900,
      transactionId: 't-1',
      occurrence: '2026-03-15',
    };

    expect(resolveOwed([base], '2027-03-20', [])[0].status).toBe('owed');

    const settled = template({
      ...base,
      history: [paid2026, { ...paid2026, month: '2027-03', transactionId: 't-2', occurrence: '2027-03-15' }],
    });
    expect(resolveOwed([settled], '2027-03-20', [])[0].status).toBe('settled');
  });
});

describe('useOwedRecurrings', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0)); // 28 Jul 2026
    await db.accounts.clear();
    await db.recurrings.clear();
    await db.accounts.bulkAdd([bank('acc-1', 0), bank('acc-2', 1)]);
    await db.recurrings.bulkAdd([
      template({ id: 'r-1', label: 'Loyer', accountId: 'acc-1', createdAt: '2026-07-01T12:00:00' }),
      template({ id: 'r-2', label: 'Internet', accountId: 'acc-2', createdAt: '2026-07-01T12:00:00' }),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves out templates of accounts outside the scope', async () => {
    const { result } = renderHook(() => useOwedRecurrings('acc-1'));

    await waitFor(() => expect(result.current.owed).toHaveLength(1));
    expect(result.current.owed.map((e) => e.recurring.label)).toEqual(['Loyer']);
  });

  it('gives two callers the very same owed set', async () => {
    const a = renderHook(() => useOwedRecurrings('all'));
    const b = renderHook(() => useOwedRecurrings('all'));

    await waitFor(() => expect(a.result.current.owed).toHaveLength(2));
    await waitFor(() => expect(b.result.current.owed).toHaveLength(2));
    expect(a.result.current.owed.map((e) => [e.recurring.id, e.occurrence])).toEqual(
      b.result.current.owed.map((e) => [e.recurring.id, e.occurrence]),
    );
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
