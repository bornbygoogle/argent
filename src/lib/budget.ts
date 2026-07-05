// Budget write helpers. A budget is per-account (unique accountId). The screen
// loads the account's budget (or defaults) and saves the full shape on submit.
import { db } from '@/db/db';
import { uid } from '@/lib/id';
import { round2 } from '@/lib/calc';
import type { Budget, CategoryLimit, WarningThreshold } from '@/types/models';

export const DEFAULT_WARNING: WarningThreshold = { mode: 'percent', value: 80 };

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
