// Recurring template write helpers + the monthly "confirm" engine.
// Confirming a recurring for a month materialises it as a real transaction
// (linked via recurringSourceId) and records it in the template's history so
// it doesn't show twice. The forward-only amount edit leaves history untouched.
import { db } from '@/db/db';
import { uid } from '@/lib/id';
import { round2 } from '@/lib/calc';
import { todayISO, currentMonth } from '@/lib/date';
import { addTransaction } from '@/lib/transactions';
import type {
  Cadence,
  Recurring,
  RecurringDirection,
  RecurringHistoryEntry,
} from '@/types/models';

export interface RecurringInput {
  accountId: string;
  direction: RecurringDirection;
  label: string;
  amount: number;
  cadence: Cadence;
  icon: string;
  color: string;
  categoryId?: string;
  incomeType?: string;
}

/** Create a recurring template (no transaction yet — the user confirms per month). */
export async function createRecurring(input: RecurringInput): Promise<string> {
  const r: Recurring = {
    id: uid(),
    accountId: input.accountId,
    direction: input.direction,
    label: input.label.trim() || 'Recurring',
    amount: round2(input.amount),
    cadence: input.cadence,
    icon: input.icon,
    color: input.color,
    categoryId: input.direction === 'expense' ? input.categoryId : undefined,
    incomeType: input.direction === 'income' ? input.incomeType : undefined,
    createdAt: new Date().toISOString(),
    history: [],
  };
  await db.recurrings.add(r);
  return r.id;
}

export interface RecurringPatch {
  label?: string;
  amount?: number;
  cadence?: Cadence;
  icon?: string;
  color?: string;
  categoryId?: string;
  incomeType?: string;
}

/** Edit a template. Amount changes are forward-only (history keeps old values). */
export async function updateRecurring(id: string, patch: RecurringPatch): Promise<void> {
  const next: Partial<Recurring> = {};
  if (patch.label !== undefined) next.label = patch.label.trim() || 'Recurring';
  if (patch.amount !== undefined) next.amount = round2(patch.amount);
  if (patch.cadence !== undefined) next.cadence = patch.cadence;
  if (patch.icon !== undefined) next.icon = patch.icon;
  if (patch.color !== undefined) next.color = patch.color;
  if (patch.categoryId !== undefined) next.categoryId = patch.categoryId;
  if (patch.incomeType !== undefined) next.incomeType = patch.incomeType;
  await db.recurrings.update(id, next);
}

export async function deleteRecurring(id: string): Promise<void> {
  await db.recurrings.delete(id);
}

/** True if the recurring has been confirmed (a transaction exists) for `month`. */
export function isConfirmedIn(r: Recurring, month: string = currentMonth()): boolean {
  return r.history.some((h) => h.month === month && !!h.transactionId);
}

const historyEntryFor = (r: Recurring, month: string): RecurringHistoryEntry | undefined =>
  r.history.find((h) => h.month === month);

/**
 * Confirm a recurring for the given month: create its transaction (dated today)
 * and record the history entry. Idempotent — re-confirming returns the existing
 * transaction id without creating a duplicate.
 */
export async function confirmRecurring(
  recurring: Recurring,
  month: string = currentMonth(),
): Promise<string | null> {
  const existing = historyEntryFor(recurring, month);
  if (existing?.transactionId) return existing.transactionId;

  const txId = await addTransaction(recurring.direction, {
    amount: recurring.amount,
    accountId: recurring.accountId,
    categoryId: recurring.direction === 'expense' ? recurring.categoryId : undefined,
    incomeType: recurring.direction === 'income' ? recurring.incomeType : undefined,
    note: recurring.label,
    date: todayISO(),
  });
  await db.transactions.update(txId, { recurringSourceId: recurring.id });

  const history: RecurringHistoryEntry[] = [
    ...recurring.history.filter((h) => h.month !== month),
    { month, amount: recurring.amount, transactionId: txId },
  ];
  await db.recurrings.update(recurring.id, { history });
  return txId;
}

/** Undo a month's confirmation: delete the linked transaction + drop the entry. */
export async function unconfirmRecurring(
  recurring: Recurring,
  month: string = currentMonth(),
): Promise<void> {
  const entry = historyEntryFor(recurring, month);
  if (!entry?.transactionId) return;
  await db.transactions.delete(entry.transactionId);
  const history = recurring.history.filter((h) => h.month !== month);
  await db.recurrings.update(recurring.id, { history });
}
