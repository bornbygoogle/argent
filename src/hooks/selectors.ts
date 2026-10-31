// Reactive selectors over useLiveQuery. Components use these instead of raw queries.
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { monthOf, todayISO } from '@/lib/date';
import { periodBounds, periodOf, salaryDatesFrom } from '@/lib/period';
import { nextUnpaidOccurrence, paidMonths, periodKeyFor } from '@/lib/recurringSchedule';
import { sumExpenses, sumIncome } from '@/lib/calc';
import { computeAutoBudget, variableExpenses, type AutoBudget } from '@/lib/budget';
import type {
  Account,
  AccountScope,
  Budget,
  Category,
  IncomeSubtype,
  IncomeType,
  Recurring,
  Subcategory,
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
  return useMemo(() => (list?.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? []), [list]);
}

/** All sub-categories, ordered within each category. */
export function useSubcategories(): Subcategory[] {
  const list = useLiveQuery(() => db.subcategories.toArray(), []);
  return useMemo(() => (list?.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? []), [list]);
}

/** categoryId → its sub-categories, ordered. Categories with none are absent. */
export function useSubcategoriesByCategory(): Map<string, Subcategory[]> {
  const subs = useSubcategories();
  return useMemo(() => {
    const m = new Map<string, Subcategory[]>();
    for (const s of subs) {
      const arr = m.get(s.categoryId);
      if (arr) arr.push(s);
      else m.set(s.categoryId, [s]);
    }
    return m;
  }, [subs]);
}

/** id → Subcategory lookup map, for resolving a transaction's sub-category. */
export function useSubcategoryMap(): Map<string, Subcategory> {
  const subs = useSubcategories();
  return useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs]);
}

/** Income-type enum ordered. */
export function useIncomeTypes(): IncomeType[] {
  const list = useLiveQuery(() => db.incomeTypes.toArray(), []);
  return useMemo(() => (list?.slice().sort((a, b) => a.order - b.order) ?? []), [list]);
}

/** key → IncomeType lookup map (for resolving a transaction's income-type key
 *  to its record/label, including user-created types). */
export function useIncomeTypeMap(): Map<string, IncomeType> {
  const list = useLiveQuery(() => db.incomeTypes.toArray(), []);
  return useMemo(() => new Map((list ?? []).map((it) => [it.key, it])), [list]);
}

/** All income sub-types, ordered within each income type. */
export function useIncomeSubtypes(): IncomeSubtype[] {
  const list = useLiveQuery(() => db.incomeSubtypes.toArray(), []);
  return useMemo(() => (list?.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? []), [list]);
}

/** incomeTypeKey → its sub-types, ordered. Types with none are absent. */
export function useIncomeSubtypesByType(): Map<string, IncomeSubtype[]> {
  const subs = useIncomeSubtypes();
  return useMemo(() => {
    const m = new Map<string, IncomeSubtype[]>();
    for (const s of subs) {
      const arr = m.get(s.incomeTypeKey);
      if (arr) arr.push(s);
      else m.set(s.incomeTypeKey, [s]);
    }
    return m;
  }, [subs]);
}

/** id → IncomeSubtype lookup map, for resolving a transaction's sub-type. */
export function useIncomeSubtypeMap(): Map<string, IncomeSubtype> {
  const subs = useIncomeSubtypes();
  return useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs]);
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

/** No Salaire dates: periods are plain calendar months. A module constant so
 *  an omitted argument keeps a stable identity for memo dependencies. */
const NO_SALARIES: string[] = [];

/** Every Salaire date, oldest first — from ALL transactions, never the scoped
 *  list: a pay cycle belongs to the person's timeline, not to one account. */
export function useSalaryDates(): string[] {
  const all = useAllTransactions();
  return useMemo(() => salaryDatesFrom(all), [all]);
}

export interface MonthSummary {
  income: number;
  expense: number;
  net: number;
}

/** Income/expense totals for a period within a scope. */
export function useMonthSummary(
  month: string,
  scope: AccountScope,
  salaries: string[] = NO_SALARIES,
): MonthSummary {
  const tx = useScopedTransactions(scope);
  return useMemo(() => {
    const inMonth = tx.filter((t) => periodOf(t.date, salaries) === month);
    const income = sumIncome(inMonth);
    const expense = sumExpenses(inMonth);
    return { income, expense, net: income - expense };
  }, [tx, month, salaries]);
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
/** `undefined` while the query is in flight, `null` once we know there is no
 *  such movement. An edit screen that cannot tell those apart shows a
 *  "Loading…" spinner forever for a deleted or mistyped id. */
export function useTransaction(id: string | undefined): Transaction | null | undefined {
  return useLiveQuery(async () => (id ? (await db.transactions.get(id)) ?? null : null), [id]);
}

/** Both legs of a transfer by group id (for the transfer edit screen).
 *  `undefined` while the query is in flight, `[]` once we know the group does
 *  not exist — otherwise the screen renders an editable phantom transfer whose
 *  save silently does nothing. */
export function useTransfer(groupId: string | undefined): Transaction[] | undefined {
  return useLiveQuery(
    async () =>
      groupId ? db.transactions.where('transferGroupId').equals(groupId).toArray() : [],
    [groupId],
  );
}

/** All recurring templates (screens sort/filter as needed). */
export function useRecurrings(): Recurring[] {
  return useLiveQuery(() => db.recurrings.toArray(), []) ?? [];
}

/** Recurring templates within the current scope. */
export function useScopedRecurrings(scope: AccountScope): Recurring[] {
  const all = useRecurrings();
  const accounts = useAccounts();
  return useMemo(() => {
    if (scope !== 'all') return all.filter((r) => r.accountId === scope);
    // "All accounts" means the active ones — a template left on an archived
    // account is not a commitment the user is still budgeting for.
    const active = new Set(accounts.map((a) => a.id));
    return all.filter((r) => active.has(r.accountId));
  }, [all, accounts, scope]);
}

/**
 * The monthly budget derived from the user's own numbers: income for the month
 * less the recurring expenses committed against it. Single source of truth for
 * the Budget screen, the home hero and the monthly overview, so no two screens
 * can disagree about how much there is to spend.
 */
/** Expenses that count against the derived budget — everything except the
 *  recurring commitments already deducted from it. */
export function useVariableExpenses(
  scope: AccountScope,
  month: string,
  salaries: string[] = NO_SALARIES,
): Transaction[] {
  const tx = useScopedTransactions(scope);
  return useMemo(
    () => variableExpenses(tx.filter((t) => periodOf(t.date, salaries) === month)),
    [tx, month, salaries],
  );
}

export function useAutoBudget(
  scope: AccountScope,
  month: string = monthOf(todayISO()),
  salaries: string[] = NO_SALARIES,
): AutoBudget {
  const summary = useMonthSummary(month, scope, salaries);
  const recurrings = useScopedRecurrings(scope);
  return useMemo(
    () => computeAutoBudget(summary.income, recurrings, month, salaries),
    [summary.income, recurrings, month, salaries],
  );
}

/**
 * The pay cycle in progress. It runs from the latest Salaire income to the next
 * (projected one month on while it is still open), across all accounts; before
 * the first Salaire it is the plain calendar month. `month` is the cycle key —
 * the Salaire date that opened it, or 'YYYY-MM' — and `salaries` is what every
 * other selector needs to group by the same cycles.
 */
export function useBudgetPeriod(): {
  month: string;
  salaries: string[];
  start: string;
  end: string;
} {
  const salaries = useSalaryDates();
  const month = periodOf(todayISO(), salaries);
  return { month, salaries, ...periodBounds(month, salaries) };
}

/** One template read against the schedule: the instalment a press of "Log"
 *  would settle, and whether that instalment is still owed. */
export interface OwedRecurring {
  recurring: Recurring;
  /** 'YYYY-MM-DD' the template's next unpaid instalment falls on — the very
   *  date `confirmRecurring` will give the transaction. */
  occurrence: string;
  /** 'idle': nothing is owed at all (a yearly expense outside its anniversary
   *  month). 'owed': the instalment is unpaid. 'settled': its period holds one. */
  status: 'owed' | 'settled' | 'idle';
}

/** 'YYYY-MM-DD' of an ISO instant on the LOCAL calendar, the basis of `todayISO`. */
function localDateOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * What is owed, decided once. Monthly templates follow pay cycles (calendar
 * months before the first Salaire); weekly ones keep their calendar months; a
 * yearly one is owed only in the calendar month of its creation anniversary.
 *
 * The instalment is the one `confirmRecurring` would settle, so a row and its
 * Log action always name the same date, and that date lies in the period owed.
 */
export function resolveOwed(
  recurrings: Recurring[],
  today: string,
  salaries: string[],
): OwedRecurring[] {
  return recurrings.map((recurring) => {
    const occurrence = nextUnpaidOccurrence(recurring, today, salaries);
    if (recurring.cadence === 'annuel') {
      const born = localDateOf(recurring.createdAt).slice(0, 7);
      const month = today.slice(0, 7);
      if (month < born || month.slice(5, 7) !== born.slice(5, 7)) {
        return { recurring, occurrence, status: 'idle' as const };
      }
    }
    const paid = paidMonths(recurring, salaries).has(periodKeyFor(recurring, occurrence, salaries));
    return { recurring, occurrence, status: paid ? ('settled' as const) : ('owed' as const) };
  });
}

/**
 * Which recurring templates are owed, for every screen that asks. The Dashboard
 * list, the Recurring page and the Settings count all read this, so they cannot
 * disagree. Pay cycles come from ALL transactions (see useSalaryDates), the
 * templates from `scope`.
 */
export function useOwedRecurrings(scope: AccountScope): {
  entries: OwedRecurring[];
  owed: OwedRecurring[];
  settled: OwedRecurring[];
} {
  const scoped = useScopedRecurrings(scope);
  const salaries = useSalaryDates();
  const today = todayISO();
  return useMemo(() => {
    const entries = resolveOwed(scoped, today, salaries);
    return {
      entries,
      owed: entries.filter((e) => e.status === 'owed'),
      settled: entries.filter((e) => e.status === 'settled'),
    };
  }, [scoped, salaries, today]);
}

/** The budget for a single account (undefined until the user sets one). */
export function useBudget(accountId: string | undefined): Budget | undefined {
  return useLiveQuery(
    async () =>
      accountId ? db.budgets.where('accountId').equals(accountId).first() : undefined,
    [accountId],
  );
}

/** Expenses within the current scope for a period (a pay cycle or 'YYYY-MM'). */
export function useMonthExpenses(
  month: string,
  scope: AccountScope,
  salaries: string[] = NO_SALARIES,
): Transaction[] {
  const tx = useScopedTransactions(scope);
  return useMemo(
    () => tx.filter((t) => t.kind === 'expense' && periodOf(t.date, salaries) === month),
    [tx, month, salaries],
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
