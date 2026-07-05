// Reactive selectors over useLiveQuery. Components use these instead of raw queries.
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { monthOf } from '@/lib/date';
import { sumExpenses, sumIncome } from '@/lib/calc';
import type {
  Account,
  AccountScope,
  Budget,
  Category,
  IncomeType,
  Recurring,
  Transaction,
} from '@/types/models';

/** Active (non-archived) accounts ordered. */
export function useAccounts(): Account[] {
  const list = useLiveQuery(() => db.accounts.toArray(), []);
  return useMemo(
    () => (list?.filter((a) => !a.archived).sort((a, b) => a.order - b.order) ?? []),
    [list],
  );
}

/** All accounts (incl. archived), ordered — for the accounts management screen. */
export function useAccountsIncludingArchived(): Account[] {
  const list = useLiveQuery(() => db.accounts.toArray(), []);
  return useMemo(() => (list?.slice().sort((a, b) => a.order - b.order) ?? []), [list]);
}

/** All categories ordered by sortOrder. */
export function useCategories(): Category[] {
  const list = useLiveQuery(() => db.categories.toArray(), []);
  return useMemo(() => (list?.sort((a, b) => a.sortOrder - b.sortOrder) ?? []), [list]);
}

/** Income-type enum ordered. */
export function useIncomeTypes(): IncomeType[] {
  const list = useLiveQuery(() => db.incomeTypes.toArray(), []);
  return useMemo(() => (list?.sort((a, b) => a.order - b.order) ?? []), [list]);
}

/** key → IncomeType lookup map (for resolving a transaction's income-type key
 *  to its record/label, including user-created types). */
export function useIncomeTypeMap(): Map<string, IncomeType> {
  const list = useLiveQuery(() => db.incomeTypes.toArray(), []);
  return useMemo(() => new Map((list ?? []).map((it) => [it.key, it])), [list]);
}

/** id → Account lookup map for scoped "all" rows that show the account name. */
export function useAccountMap(): Map<string, Account> {
  const accounts = useAccounts();
  return useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
}

/** id → Category lookup map. */
export function useCategoryMap(): Map<string, Category> {
  const categories = useCategories();
  return useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
}

/** All transactions (used for balances / net worth across accounts). */
export function useAllTransactions(): Transaction[] {
  return useLiveQuery(() => db.transactions.toArray(), []) ?? [];
}

/** Transactions within the current scope ('all' or a single account id). */
export function useScopedTransactions(scope: AccountScope): Transaction[] {
  return (
    useLiveQuery(
      async () =>
        scope === 'all'
          ? db.transactions.toArray()
          : db.transactions.where('accountId').equals(scope).toArray(),
      [scope],
    ) ?? []
  );
}

export interface MonthSummary {
  income: number;
  expense: number;
  net: number;
}

/** Income/expense totals for a month within a scope. */
export function useMonthSummary(month: string, scope: AccountScope): MonthSummary {
  const tx = useScopedTransactions(scope);
  return useMemo(() => {
    const inMonth = tx.filter((t) => monthOf(t.date) === month);
    const income = sumIncome(inMonth);
    const expense = sumExpenses(inMonth);
    return { income, expense, net: income - expense };
  }, [tx, month]);
}

/** Recent movements (scoped), newest first, capped to `limit`. */
export function useRecentMovements(scope: AccountScope, limit = 8): Transaction[] {
  const tx = useScopedTransactions(scope);
  return useMemo(
    () =>
      [...tx]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit),
    [tx, limit],
  );
}

/** Single transaction by id (for the edit screen). */
export function useTransaction(id: string | undefined): Transaction | undefined {
  return useLiveQuery(async () => (id ? db.transactions.get(id) : undefined), [id]);
}

/** Both legs of a transfer by group id (for the transfer edit screen). */
export function useTransfer(groupId: string | undefined): Transaction[] {
  return (
    useLiveQuery(
      async () =>
        groupId ? db.transactions.where('transferGroupId').equals(groupId).toArray() : [],
      [groupId],
    ) ?? []
  );
}

/** All recurring templates (screens sort/filter as needed). */
export function useRecurrings(): Recurring[] {
  return useLiveQuery(() => db.recurrings.toArray(), []) ?? [];
}

/** The budget for a single account (undefined until the user sets one). */
export function useBudget(accountId: string | undefined): Budget | undefined {
  return useLiveQuery(
    async () =>
      accountId ? db.budgets.where('accountId').equals(accountId).first() : undefined,
    [accountId],
  );
}

/** Expenses within the current scope for a whole month ('YYYY-MM'). */
export function useMonthExpenses(month: string, scope: AccountScope): Transaction[] {
  const tx = useScopedTransactions(scope);
  return useMemo(
    () => tx.filter((t) => t.kind === 'expense' && monthOf(t.date) === month),
    [tx, month],
  );
}

/** Expenses within the current scope for a calendar year ('YYYY'). */
export function useYearExpenses(year: number, scope: AccountScope): Transaction[] {
  const tx = useScopedTransactions(scope);
  return useMemo(
    () => tx.filter((t) => t.kind === 'expense' && t.date.slice(0, 4) === String(year)),
    [tx, year],
  );
}
