// Pure money computation — no i18n, no DB. Unit-testable.
import type { Account, Transaction } from '@/types/models';

export const isExpense = (t: Transaction): boolean => t.kind === 'expense';
export const isIncome = (t: Transaction): boolean => t.kind === 'income';
export const isTransfer = (t: Transaction): boolean => t.kind === 'transfer';

/** Display direction for a row within an account: income/transfer-in = 'in', else 'out'. */
export function direction(t: Transaction): 'in' | 'out' {
  if (isIncome(t)) return 'in';
  if (isTransfer(t)) return t.transferRole === 'in' ? 'in' : 'out';
  return 'out';
}

/** Signed amount for aggregation: expense/transfer-out = −, income/transfer-in = +.
 *  For scope 'all', a transfer's two legs cancel (out + in = 0), so net worth is unaffected. */
export function signedAmount(t: Transaction): number {
  if (isExpense(t)) return -t.amount;
  if (isIncome(t)) return t.amount;
  if (isTransfer(t)) return t.transferRole === 'in' ? t.amount : -t.amount;
  return 0;
}

/** Σ expense magnitudes within the set (positive number). */
export function sumExpenses(ts: Transaction[]): number {
  return ts.reduce((acc, t) => acc + (isExpense(t) ? t.amount : 0), 0);
}

/** Σ income magnitudes within the set (positive number). */
export function sumIncome(ts: Transaction[]): number {
  return ts.reduce((acc, t) => acc + (isIncome(t) ? t.amount : 0), 0);
}

/** Live balance for one account: opening + income − expense + transfers-in − transfers-out. */
export function accountBalance(account: Account, allTx: Transaction[]): number {
  const mine = allTx.filter((t) => t.accountId === account.id);
  let bal = account.openingBalance + sumIncome(mine) - sumExpenses(mine);
  for (const t of mine) {
    if (isTransfer(t)) bal += t.transferRole === 'in' ? t.amount : -t.amount;
  }
  return bal;
}

/** Total live balance across the given accounts (net worth). */
export function totalBalance(accounts: Account[], allTx: Transaction[]): number {
  return accounts.reduce((acc, a) => acc + accountBalance(a, allTx), 0);
}

/** Round to cents to avoid float drift on write. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface CategorySlice {
  categoryId: string;
  total: number;
  share: number; // 0..1 of the whole
}

/** Aggregate expenses by category, descending, with share of total. */
export function byCategory(expenses: Transaction[]): CategorySlice[] {
  const totals = new Map<string, number>();
  let whole = 0;
  for (const t of expenses) {
    if (!isExpense(t)) continue;
    const key = t.categoryId ?? 'cat-autre';
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
    whole += t.amount;
  }
  return [...totals.entries()]
    .map(([categoryId, total]) => ({
      categoryId,
      total,
      share: whole > 0 ? total / whole : 0,
    }))
    .sort((a, b) => b.total - a.total);
}
