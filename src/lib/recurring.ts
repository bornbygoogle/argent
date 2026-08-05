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
import { MAX_PER_MONTH } from '@/lib/recurringDedupe';
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

/**
 * The entry that settled the instalment falling in `month`, if one did.
 *
 * Resolved by month rather than by exact date: the due day may have moved
 * since, and the payment stands whatever day it was made against. Read from
 * the end, so where a month carries more than one — only possible on data
 * predating the ceiling — undoing takes back the most recent.
 */
const paidEntryIn = (r: Recurring, month: string): RecurringHistoryEntry | undefined =>
  [...r.history]
    .reverse()
    .find((h) => !!h.transactionId && occurrenceOf(h, r).slice(0, 7) === month);

/**
 * Settle the oldest instalment that is due and still unpaid, creating its
 * transaction dated on that instalment's own day and recording it in history.
 *
 * Idempotent — when the instalment it picks is already settled, the existing
 * transaction id comes back and nothing is written.
 *
 * Returns null when the month is full. A monthly template owes one instalment
 * per month and no more, so a month already holding one is done — whatever a
 * due-day edit may have made the row read as.
 */
export async function confirmRecurring(
  recurring: Recurring,
  today: string = todayISO(),
): Promise<string | null> {
  // Everything runs inside one transaction against a freshly read template.
  // The caller holds a React snapshot, and two presses racing on the same stale
  // history each wrote their own transaction while only the last entry
  // survived — leaving copies no screen could reach to un-log.
  return db.transaction('rw', db.transactions, db.recurrings, async () => {
    const r = await db.recurrings.get(recurring.id);
    if (!r) return null;

    const occurrence = nextUnpaidOccurrence(r, today);
    const existing = paidEntryIn(r, occurrence.slice(0, 7));
    if (existing?.transactionId) return existing.transactionId;

    // Count the transactions themselves, not the history entries: a lost entry
    // must not hand back a slot that a real transaction still occupies.
    const settled = await db.transactions
      .where('recurringSourceId')
      .equals(r.id)
      .filter((t) => t.date.slice(0, 7) === occurrence.slice(0, 7))
      .count();
    if (settled >= MAX_PER_MONTH) return null;

    const txId = await addTransaction(r.direction, {
      amount: r.amount,
      accountId: r.accountId,
      categoryId: r.direction === 'expense' ? r.categoryId : undefined,
      incomeType: r.direction === 'income' ? r.incomeType : undefined,
      note: r.label,
      date: occurrence,
    });
    await db.transactions.update(txId, { recurringSourceId: r.id });

    const history: RecurringHistoryEntry[] = [
      ...r.history.filter((h) => occurrenceOf(h, r) !== occurrence),
      {
        month: occurrence.slice(0, 7),
        amount: r.amount,
        transactionId: txId,
        occurrence,
      },
    ];
    await db.recurrings.update(r.id, { history });
    return txId;
  });
}

/** Undo one instalment: delete the linked transaction + drop the entry. */
export async function unconfirmRecurring(
  recurring: Recurring,
  occurrence: string = dueDateFor(recurring, currentMonth()),
): Promise<void> {
  // The caller names the instalment through today's due day, which stopped
  // matching the stored one the moment that day was edited — so resolve the
  // month it points at, not the date itself.
  const entry = paidEntryIn(recurring, occurrence.slice(0, 7));
  if (!entry?.transactionId) return;
  await db.transactions.delete(entry.transactionId);
  const history = recurring.history.filter((h) => h.transactionId !== entry.transactionId);
  await db.recurrings.update(recurring.id, { history });
}
