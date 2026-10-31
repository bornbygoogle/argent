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
import { daysInMonth, localDateOf, nextMonth } from '@/lib/date';
import { periodBounds, periodOf } from '@/lib/period';
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
 * The unit a date settles in: the pay cycle (see lib/period) for a MONTHLY
 * template, the calendar month for weekly and yearly ones. Before the first
 * Salaire, and with none at all, a monthly template reads the calendar month too.
 */
export function periodKeyFor(
  r: Pick<Recurring, 'cadence'>,
  date: string,
  salaries: string[] = [],
): string {
  return r.cadence === 'mensuel' ? periodOf(date, salaries) : date.slice(0, 7);
}

/**
 * The periods already carrying a settled instalment: pay cycles for a monthly
 * template (calendar months before the first Salaire), calendar months otherwise.
 * The occurrence is the half that survives a due-day edit, so it is what is keyed.
 */
export function paidMonths(r: Recurring, salaries: string[] = []): Set<string> {
  return new Set([...paidOccurrences(r)].map((o) => periodKeyFor(r, o, salaries)));
}

/**
 * Has the instalment falling in `month` been paid?
 *
 * Asked by period rather than by exact date on purpose. Matching the stored
 * occurrence against `dueDateFor` compared a date written under the *old* due
 * day with one computed from the *current* one, so every edit of the day made a
 * settled month read as unpaid and offered itself to be paid again.
 *
 * With Salaire dates, a monthly template's calendar month reads as paid only
 * when every cycle it touches is paid: the one holding its due date, and each one
 * opened inside the month.
 */
export function isOccurrencePaidIn(
  r: Recurring,
  month: string,
  salaries: string[] = [],
): boolean {
  const paid = paidMonths(r, salaries);
  if (r.cadence !== 'mensuel' || salaries.length === 0) return paid.has(month);
  const touched = new Set([periodOf(dueDateFor(r, month), salaries)]);
  for (const s of salaries) if (s.slice(0, 7) === month) touched.add(s);
  return [...touched].every((p) => paid.has(p));
}

/** The first of `candidates` lying in `[start, end)`, else `start`. */
function candidateIn(r: DueDayed, startMonth: string, start: string, end: string): string {
  for (const month of [startMonth, nextMonth(startMonth)]) {
    const date = dueDateFor(r, month);
    if (date >= start && date < end) return date;
  }
  return start;
}

/** The date a monthly template settles inside `period`. */
function candidateOf(r: DueDayed, period: string, salaries: string[]): string {
  const { start, end } = periodBounds(period, salaries);
  return candidateIn(r, start.slice(0, 7), start, end);
}

/** Periods of a monthly template, oldest first, that can already be owed:
 *  calendar months up to the first Salaire, then each cycle opened by `today`. */
function monthlyPeriods(createdOn: string, today: string, salaries: string[]): string[] {
  const periods: string[] = [];
  const first = salaries[0];
  const lastMonth = first && first.slice(0, 7) < today.slice(0, 7) ? first.slice(0, 7) : today.slice(0, 7);
  let month = createdOn.slice(0, 7);
  for (let i = 0; i < MAX_MONTHS && month <= lastMonth; i++) {
    // A first Salaire on the 1st leaves its calendar month empty.
    if (!first || first > `${month}-01`) periods.push(month);
    month = nextMonth(month);
  }
  for (const s of salaries) if (s <= today) periods.push(s);
  return periods;
}

/**
 * The instalment a press of "Log" should settle: the oldest one already due
 * and still unpaid. When nothing is due yet — everything owed is settled, or
 * the template is new — it settles the current period's, so paying early still
 * works and pressing again is idempotent.
 *
 * Monthly templates walk pay cycles (calendar months before the first Salaire).
 * Weekly templates walk calendar months. Yearly templates walk only the month of
 * their creation anniversary: they are owed there and nowhere else.
 */
export function nextUnpaidOccurrence(
  r: Recurring,
  today: string,
  salaries: string[] = [],
): string {
  const paid = paidMonths(r, salaries);
  const createdOn = localDateOf(r.createdAt);
  const endMonth = today.slice(0, 7);

  if (r.cadence === 'mensuel') {
    for (const period of monthlyPeriods(createdOn, today, salaries)) {
      const { start, end } = periodBounds(period, salaries);
      if (start >= end) continue;
      const occurrence = candidateOf(r, period, salaries);
      if (occurrence >= createdOn && occurrence <= today && !paid.has(period)) {
        return occurrence;
      }
    }
    return candidateOf(r, periodOf(today, salaries), salaries);
  }

  const bornMonth = createdOn.slice(0, 7);
  const yearly = r.cadence === 'annuel';
  let month = bornMonth;
  for (let i = 0; i < MAX_MONTHS && month <= endMonth; i++) {
    const occurrence = dueDateFor(r, month);
    // Skip instalments that fall before the template existed, and those not
    // yet due — the first is not owed, the second is not owed *yet*. A month
    // already settled is skipped whatever day it was settled on.
    const owedMonth = !yearly || month.slice(5, 7) === bornMonth.slice(5, 7);
    if (owedMonth && occurrence >= createdOn && occurrence <= today && !paid.has(month)) {
      return occurrence;
    }
    month = nextMonth(month);
  }
  return yearly
    ? dueDateFor(r, `${endMonth.slice(0, 4)}-${bornMonth.slice(5, 7)}`)
    : dueDateFor(r, endMonth);
}

/**
 * The days of `month` on which expense templates fall due — what the calendar
 * marks.
 *
 * Read through `dueDateFor`, so a day the month cannot hold clamps exactly as
 * every other reading of the schedule does. Cadence changes only which months
 * are marked, never how many days inside one: a template materialises a single
 * instalment per month whatever it reads (see dedupeRecurringMonths), so a
 * weekly charge marks the same one day a monthly charge does. An annual charge
 * is the exception worth making — it falls once a year, in the month it was
 * taken out, and marking it monthly would claim eleven charges that never come.
 *
 * Months before the template existed are left bare: the charge was not owed
 * then, and a dot in a past month is a bill the user never had.
 */
export function recurringDueDays(recurrings: Recurring[], month: string): Set<number> {
  const days = new Set<number>();
  for (const r of recurrings) {
    if (r.direction !== 'expense') continue;
    const born = localDateOf(r.createdAt).slice(0, 7);
    if (month < born) continue;
    if (r.cadence === 'annuel' && month.slice(5, 7) !== born.slice(5, 7)) continue;
    days.add(Number(dueDateFor(r, month).slice(8, 10)));
  }
  return days;
}
