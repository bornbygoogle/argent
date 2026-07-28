// Recurring template write helpers + the monthly "confirm" engine.
// Confirming a recurring for a month materialises it as a real transaction
// (linked via recurringSourceId) and records it in the template's history so
// it doesn't show twice. The forward-only amount edit leaves history untouched.
import { db } from '@/db/db';
import { uid } from '@/lib/id';
import { round2 } from '@/lib/calc';
import { currentMonth, todayISO } from '@/lib/date';
import {
  dueDateFor,
  isOccurrencePaidIn,
  nextUnpaidOccurrence,
  occurrenceOf,
} from '@/lib/recurringSchedule';
import { addTransaction } from '@/lib/transactions';
import type {
  Cadence,
  Recurring,
  RecurringDirection,
  RecurringHistoryEntry,
} from '@/types/models';

export type { Recurring } from '@/types/models';

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
  /** Day of the month it falls due, 1–31. Omit for "due from the 1st". */
  dueDay?: number;
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
    dueDay: input.dueDay,
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
  /** `null` clears the day; omitting the key leaves it untouched. */
  dueDay?: number | null;
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
  // Dexie deletes a property when its update value is `undefined`, which is
  // what clearing has to do: a `null` left in the row would read as a change
  // to the sync fingerprint and differ from a recurring that never had a day.
  if (patch.dueDay !== undefined) next.dueDay = patch.dueDay ?? undefined;
  await db.recurrings.update(id, next);
}

export async function deleteRecurring(id: string): Promise<void> {
  await db.recurrings.delete(id);
}

/**
 * True when the instalment falling in `month` has been paid.
 *
 * Note this asks about the *occurrence* landing in that month, not about any
 * payment recorded during it: a bill due on the 30th and settled on 2 August
 * still settles July's instalment, and July must read as done.
 */
export function isConfirmedIn(r: Recurring, month: string = currentMonth()): boolean {
  return isOccurrencePaidIn(r, month);
}

const entryForOccurrence = (
  r: Recurring,
  occurrence: string,
): RecurringHistoryEntry | undefined =>
  r.history.find((h) => occurrenceOf(h, r) === occurrence);

/**
 * Settle the oldest instalment that is due and still unpaid, creating its
 * transaction dated on that instalment's own day and recording it in history.
 *
 * Idempotent — when the instalment it picks is already settled, the existing
 * transaction id comes back and nothing is written.
 */
export async function confirmRecurring(
  recurring: Recurring,
  today: string = todayISO(),
): Promise<string | null> {
  const occurrence = nextUnpaidOccurrence(recurring, today);
  const existing = entryForOccurrence(recurring, occurrence);
  if (existing?.transactionId) return existing.transactionId;

  const txId = await addTransaction(recurring.direction, {
    amount: recurring.amount,
    accountId: recurring.accountId,
    categoryId: recurring.direction === 'expense' ? recurring.categoryId : undefined,
    incomeType: recurring.direction === 'income' ? recurring.incomeType : undefined,
    note: recurring.label,
    date: occurrence,
  });
  await db.transactions.update(txId, { recurringSourceId: recurring.id });

  const history: RecurringHistoryEntry[] = [
    ...recurring.history.filter((h) => occurrenceOf(h, recurring) !== occurrence),
    {
      month: occurrence.slice(0, 7),
      amount: recurring.amount,
      transactionId: txId,
      occurrence,
    },
  ];
  await db.recurrings.update(recurring.id, { history });
  return txId;
}

/** Undo one instalment: delete the linked transaction + drop the entry. */
export async function unconfirmRecurring(
  recurring: Recurring,
  occurrence: string = dueDateFor(recurring, currentMonth()),
): Promise<void> {
  const entry = entryForOccurrence(recurring, occurrence);
  if (!entry?.transactionId) return;
  await db.transactions.delete(entry.transactionId);
  const history = recurring.history.filter((h) => occurrenceOf(h, recurring) !== occurrence);
  await db.recurrings.update(recurring.id, { history });
}
