// Budget write helpers. A budget is per-account (unique accountId). The screen
// loads the account's budget (or defaults) and saves the full shape on submit.
import { db } from '@/db/db';
import { uid } from '@/lib/id';
import { round2 } from '@/lib/calc';
import { isConfirmedIn } from '@/lib/recurring';
import {
  isOccurrencePaidIn,
  occurrenceOf,
  paidMonths,
  paidOccurrences,
} from '@/lib/recurringSchedule';
import { periodBounds, periodOf } from '@/lib/period';
import type {
  Budget,
  Cadence,
  CategoryLimit,
  Recurring,
  Transaction,
  WarningThreshold,
} from '@/types/models';

export const DEFAULT_WARNING: WarningThreshold = { mode: 'percent', value: 80 };

/** What one recurring line costs in a single month.
 *  A week is 52/12 of a month, not a quarter of one — treating it as 4 weeks
 *  understates every weekly commitment by roughly a month a year. */
export function monthlyEquivalent(amount: number, cadence: Cadence): number {
  switch (cadence) {
    case 'hebdo':
      return round2((amount * 52) / 12);
    case 'annuel':
      return round2(amount / 12);
    default:
      return round2(amount);
  }
}

/**
 * The expenses that count against the derived budget.
 *
 * That budget is income *minus* the recurring commitments, so a transaction
 * created by confirming a recurring has already been taken out of it. Counting
 * it again as spending would subtract the same rent twice and under-report what
 * is left by exactly its amount.
 */
/** Has this template's instalment for the budget month been settled? */
function settledIn(r: Recurring, month: string, salaries: string[]): boolean {
  if (salaries.length === 0) return isConfirmedIn(r, month);
  return r.history.some(
    (h) => !!h.transactionId && periodOf(occurrenceOf(h, r), salaries) === month,
  );
}

/** 'YYYY-MM-DD' of an ISO instant on the LOCAL calendar (same basis as
 *  recurringDueDays). */
function localDateOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const DAY_MS = 86_400_000;

function utcDay(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

function addDays(date: string, days: number): string {
  return new Date(utcDay(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * What an expense template owes in the period `month` — a schedule, never a
 * rate. `month` is a pay-cycle key ('YYYY-MM-DD') or a calendar month
 * ('YYYY-MM').
 *
 *  - monthly: its full amount.
 *  - yearly: its full amount in the calendar month of its creation
 *    anniversary, nothing in any other month.
 *  - weekly: its full amount for each occurrence (creation date + 7k days)
 *    falling inside the period.
 *
 * With `unsettledOnly`, instalments already paid are left out: they are
 * already out of the balance.
 */
function owedAmount(
  r: Recurring,
  month: string,
  salaries: string[],
  unsettledOnly: boolean,
): number {
  if (r.cadence === 'mensuel') {
    if (unsettledOnly) {
      const settled =
        month.length > 7 ? paidMonths(r, salaries).has(month) : isOccurrencePaidIn(r, month, salaries);
      if (settled) return 0;
    }
    return r.amount;
  }

  const createdOn = localDateOf(r.createdAt);

  if (r.cadence === 'annuel') {
    const calendar = month.slice(0, 7);
    const born = createdOn.slice(0, 7);
    if (calendar < born || calendar.slice(5, 7) !== born.slice(5, 7)) return 0;
    if (unsettledOnly && paidMonths(r, salaries).has(calendar)) return 0;
    return r.amount;
  }

  // Weekly: every occurrence inside [start, end) on the creation weekday.
  const { start, end } = periodBounds(month, salaries);
  const paid = unsettledOnly ? paidOccurrences(r) : new Set<string>();
  const first = Math.max(0, Math.ceil((utcDay(start) - utcDay(createdOn)) / (7 * DAY_MS)));
  let total = 0;
  for (let date = addDays(createdOn, first * 7); date < end; date = addDays(date, 7)) {
    if (date >= start && !paid.has(date)) total += r.amount;
  }
  return total;
}

/**
 * What the period still owes in bills that have not been debited yet, each on
 * its own schedule (see `owedAmount`). This is what stands between the balance
 * and what is really free: a settled bill is already out of the balance, so only
 * the unsettled ones are subtracted — never both.
 */
export function upcomingCommitments(
  recurrings: Recurring[],
  month: string,
  salaries: string[] = [],
): number {
  return round2(
    recurrings
      .filter((r) => r.direction === 'expense')
      .reduce((s, r) => s + owedAmount(r, month, salaries, true), 0),
  );
}

export function variableExpenses(transactions: Transaction[]): Transaction[] {
  return transactions.filter((t) => t.kind === 'expense' && !t.recurringSourceId);
}

export interface AutoBudget {
  /** Booked income plus recurring income still due this month. */
  income: number;
  /** Every recurring expense owed in the period, on its own schedule. */
  recurringExpenses: number;
  /** What is left to allocate: income − commitments, floored at zero. */
  total: number;
  /** True when the commitments outrun the income. */
  overcommitted: boolean;
}

/**
 * The budget a month can actually support: what comes in, less what is already
 * committed to recurring expenses. Whatever remains is what there is to spend.
 *
 * Confirming a recurring materialises a real transaction, so a confirmed
 * recurring *income* is already inside `actualIncome` and must not be added
 * again. Recurring *expenses* are counted whether confirmed or not — actual
 * expenses are never summed here, so there is nothing to double count, and a
 * commitment is a commitment whether it has been paid yet or not.
 *
 * `salaries` are the Salaire dates the pay cycles run from (empty = calendar
 * months). They have to reach the settled check too: a salary paid on 26 August
 * settles the cycle it opens, and asking the calendar would leave that cycle
 * still expecting it — on top of the money already in `actualIncome`.
 */
export function computeAutoBudget(
  actualIncome: number,
  recurrings: Recurring[],
  month: string,
  salaries: string[] = [],
): AutoBudget {
  let stillDue = 0;
  let recurringExpenses = 0;

  for (const r of recurrings) {
    if (r.direction === 'expense') {
      recurringExpenses += owedAmount(r, month, salaries, false);
    } else if (!settledIn(r, month, salaries)) {
      stillDue += monthlyEquivalent(r.amount, r.cadence);
    }
  }

  const income = round2(actualIncome + stillDue);
  recurringExpenses = round2(recurringExpenses);

  return {
    income,
    recurringExpenses,
    total: round2(Math.max(0, income - recurringExpenses)),
    overcommitted: recurringExpenses > income,
  };
}

export async function getBudget(accountId: string): Promise<Budget | undefined> {
  if (!accountId) return undefined;
  return db.budgets.where('accountId').equals(accountId).first();
}

export interface BudgetInput {
  monthlyBudget: number;
  categoryLimits: CategoryLimit[];
  warningThreshold: WarningThreshold;
  rolloverEnabled: boolean;
}

export function defaultBudget(accountId: string): Budget {
  return {
    id: uid(),
    accountId,
    monthlyBudget: 0,
    categoryLimits: [],
    warningThreshold: { ...DEFAULT_WARNING },
    rolloverEnabled: true,
  };
}

/** Create or replace the budget for an account. Returns the persisted budget. */
export async function upsertBudget(accountId: string, input: BudgetInput): Promise<Budget> {
  const existing = await getBudget(accountId);
  const monthlyBudget = round2(input.monthlyBudget);
  const categoryLimits = input.categoryLimits
    .filter((c) => c.limit !== null && c.limit > 0)
    .map((c) => ({ categoryId: c.categoryId, limit: round2(c.limit as number) }));

  if (existing) {
    const next: Budget = {
      ...existing,
      monthlyBudget,
      categoryLimits,
      warningThreshold: input.warningThreshold,
      rolloverEnabled: input.rolloverEnabled,
    };
    await db.budgets.put(next);
    return next;
  }

  const budget: Budget = {
    id: uid(),
    accountId,
    monthlyBudget,
    categoryLimits,
    warningThreshold: input.warningThreshold,
    rolloverEnabled: input.rolloverEnabled,
  };
  await db.budgets.add(budget);
  return budget;
}

export async function deleteBudget(accountId: string): Promise<void> {
  await db.budgets.where('accountId').equals(accountId).delete();
}
