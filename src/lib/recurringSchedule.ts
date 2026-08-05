// Occurrences: the dated instalments a recurring template is made of.
//
// A template due on the 30th does not owe "July" — it owes the instalment
// falling on 30 July. Keying payments to the calendar month instead conflated
// the two: logging June's bill on 2 July consumed July, and July's instalment
// could never be recorded at all. So a payment belongs to an *occurrence*, and
// the month is only where that occurrence happens to land.
//
// The day is clamped at read time, never rewritten: a 31 stored against a
// February must still mean the 31st in March. And the day never decides whether
// a row is shown — a bill due on the 30th is still the month's work on the 28th.
import { daysInMonth, nextMonth, prevMonth } from '@/lib/date';
import type { Recurring, RecurringHistoryEntry } from '@/types/models';

/** Anything carrying an optional due day — the whole record is never needed. */
export type DueDayed = Pick<Recurring, 'dueDay'>;

/** A walk from one month to the next cannot outrun this. Twenty years of
 *  monthly instalments is far past any real backlog and stops a bad date
 *  turning the search into a hang. */
const MAX_MONTHS = 240;

/** The day, held inside the month's real length. */
export function clampedDay(dueDay: number, month: string): number {
  return Math.min(Math.max(Math.trunc(dueDay), 1), daysInMonth(month));
}

/** 'YYYY-MM-DD' the recurring falls due in `month`. No day set = the 1st. */
export function dueDateFor(r: DueDayed, month: string): string {
  const day = r.dueDay == null ? 1 : clampedDay(r.dueDay, month);
  return `${month}-${String(day).padStart(2, '0')}`;
}

/**
 * The occurrence a history entry pays for.
 *
 * Entries written before occurrences existed carry only a month; they read as
 * that month's due date, which is exactly what they used to mean. The backfill
 * in lib/recurringMigration refines them using the transaction's real date.
 */
export function occurrenceOf(
  entry: Pick<RecurringHistoryEntry, 'month' | 'occurrence'>,
  r: DueDayed,
): string {
  return entry.occurrence ?? dueDateFor(r, entry.month);
}

/** Every occurrence already paid for, as a set of 'YYYY-MM-DD'. */
export function paidOccurrences(r: Recurring): Set<string> {
  return new Set(
    r.history.filter((h) => !!h.transactionId).map((h) => occurrenceOf(h, r)),
  );
}

/**
 * The months already carrying a settled instalment.
 *
 * A monthly template owes exactly one instalment per month, and `dueDateFor`
 * always lands inside the month it is asked about — so an occurrence and its
 * month say the same thing, and the month is the half that survives an edit.
 */
export function paidMonths(r: Recurring): Set<string> {
  return new Set([...paidOccurrences(r)].map((o) => o.slice(0, 7)));
}

/**
 * Has the instalment falling in `month` been paid?
 *
 * Asked by month rather than by exact date on purpose. Matching the stored
 * occurrence against `dueDateFor` compared a date written under the *old* due
 * day with one computed from the *current* one, so every edit of the day made a
 * settled month read as unpaid and offered itself to be paid again.
 */
export function isOccurrencePaidIn(r: Recurring, month: string): boolean {
  return paidMonths(r).has(month);
}

/**
 * The latest occurrence falling on or before `date`, never earlier than
 * `notBefore`. Returns null when the template did not yet exist.
 */
export function lastOccurrenceOnOrBefore(
  r: DueDayed,
  date: string,
  notBefore?: string,
): string | null {
  let month = date.slice(0, 7);
  let candidate = dueDateFor(r, month);
  if (candidate > date) {
    month = prevMonth(month);
    candidate = dueDateFor(r, month);
  }
  if (notBefore && candidate < notBefore) return null;
  return candidate;
}

/**
 * The instalment a press of "Log" should settle: the oldest one already due
 * and still unpaid. When nothing is due yet — everything owed is settled, or
 * the template is new — it settles this month's, so paying early still works.
 */
export function nextUnpaidOccurrence(r: Recurring, today: string): string {
  const paid = paidMonths(r);
  const createdOn = r.createdAt.slice(0, 10);
  const endMonth = today.slice(0, 7);

  let month = createdOn.slice(0, 7);
  for (let i = 0; i < MAX_MONTHS && month <= endMonth; i++) {
    const occurrence = dueDateFor(r, month);
    // Skip instalments that fall before the template existed, and those not
    // yet due — the first is not owed, the second is not owed *yet*. A month
    // already settled is skipped whatever day it was settled on.
    if (occurrence >= createdOn && occurrence <= today && !paid.has(month)) {
      return occurrence;
    }
    month = nextMonth(month);
  }
  return dueDateFor(r, endMonth);
}
