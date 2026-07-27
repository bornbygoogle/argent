// Budget write helpers. A budget is per-account (unique accountId). The screen
// loads the account's budget (or defaults) and saves the full shape on submit.
import { db } from '@/db/db';
import { uid } from '@/lib/id';
import { round2 } from '@/lib/calc';
import { isConfirmedIn } from '@/lib/recurring';
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
export function variableExpenses(transactions: Transaction[]): Transaction[] {
  return transactions.filter((t) => t.kind === 'expense' && !t.recurringSourceId);
}

export interface AutoBudget {
  /** Booked income plus recurring income still due this month. */
  income: number;
  /** Every recurring expense, as its monthly equivalent. */
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
 */
export function computeAutoBudget(
  actualIncome: number,
  recurrings: Recurring[],
  month: string,
): AutoBudget {
  let stillDue = 0;
  let recurringExpenses = 0;

  for (const r of recurrings) {
    const monthly = monthlyEquivalent(r.amount, r.cadence);
    if (r.direction === 'expense') recurringExpenses += monthly;
    else if (!isConfirmedIn(r, month)) stillDue += monthly;
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
