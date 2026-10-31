// Backfill: teach old history entries which instalment they actually paid.
//
// Before occurrences existed an entry recorded only the month in which the
// button was pressed, and nothing tied it to the money that moved. The
// transaction carries the date it was logged, so the instalment can be
// recovered rather than guessed.
//
// The instalment is the one falling in the *period the transaction's own date
// sits in*, and that is not a shortcut for "the month on the entry". A payment
// is an instalment because money moved, and everything downstream counts that
// money by the period it moved in: the ceiling in confirmRecurring and the
// repair in lib/recurringDedupe both allow one transaction per template per
// period. An occurrence pointing at any other period therefore describes a
// payment that does not exist — the period it names reads settled with no money
// in it, and the period holding the money reads owed and jams.
//
// The period is the PAY CYCLE for a monthly template and the calendar month for
// weekly and yearly ones (see periodKeyFor); before the first Salaire a monthly
// template reads calendar months too. A cycle can straddle two calendar months,
// so a payment dated in the month after its due date can still correctly settle
// the earlier month's instalment: the calendar month is never the test.
//
// The pass never rewrites `month`, and it is idempotent: an entry whose
// occurrence already falls in its payment's period is left untouched, byte for
// byte, and does not mark the template dirty.
import { db } from '@/db/db';
import { nextMonth } from '@/lib/date';
import { periodBounds, salaryDates } from '@/lib/period';
import { dueDateFor, periodKeyFor } from '@/lib/recurringSchedule';
import type { Recurring, RecurringHistoryEntry } from '@/types/models';

/** A walk from month to month cannot outrun this; it only stops a bad date hanging. */
const MAX_MONTHS = 240;

/** The instalment a legacy entry settled, from the date its transaction carries. */
export async function occurrenceForLegacyEntry(
  r: Recurring,
  entry: RecurringHistoryEntry,
  salaries: string[] = [],
): Promise<string> {
  const fallback = dueDateFor(r, entry.month);
  if (!entry.transactionId) return fallback;

  const tx = await db.transactions.get(entry.transactionId);
  // A deleted transaction leaves nothing to reason from; the month's own due
  // date is exactly what the entry used to mean, so nothing changes.
  if (!tx?.date) return fallback;

  const period = periodKeyFor(r, tx.date, salaries);
  // A calendar month: weekly, yearly, or before the first Salaire.
  if (period.length === 7) return dueDateFor(r, period);

  // A pay cycle: the due date that lands inside it, which may be in the month
  // the cycle opened or the one after.
  const lastMonth = periodBounds(period, salaries).end.slice(0, 7);
  let month = period.slice(0, 7);
  for (let i = 0; i < MAX_MONTHS && month <= lastMonth; i++) {
    const candidate = dueDateFor(r, month);
    if (periodKeyFor(r, candidate, salaries) === period) return candidate;
    month = nextMonth(month);
  }
  // No due date falls in this cycle; the payment's own date does, so the entry
  // stays self-consistent and is not flagged again on the next launch.
  return tx.date;
}

/**
 * An entry attributed to an instalment outside the period its payment sits in.
 *
 * Either direction is wrong and for the same reason: the money moved once, in
 * one period, and that period is the one the instalment belongs to. Recomputing
 * such an entry can never disturb a correct one.
 */
async function isMisattributed(
  r: Recurring,
  entry: RecurringHistoryEntry,
  salaries: string[],
): Promise<boolean> {
  if (!entry.occurrence || !entry.transactionId) return false;
  const tx = await db.transactions.get(entry.transactionId);
  if (!tx?.date) return false;
  return periodKeyFor(r, tx.date, salaries) !== periodKeyFor(r, entry.occurrence, salaries);
}

/**
 * Give every history entry the instalment it actually settled: filling the gap
 * on entries that predate occurrences, and repairing any that were attributed
 * wrongly. Returns how many templates changed.
 */
export async function backfillOccurrences(): Promise<number> {
  const recurrings = await db.recurrings.toArray();
  const salaries = await salaryDates();
  let changed = 0;

  for (const r of recurrings) {
    let dirty = false;
    const history: RecurringHistoryEntry[] = [];

    for (const entry of r.history) {
      if (entry.occurrence !== undefined && !(await isMisattributed(r, entry, salaries))) {
        history.push(entry);
        continue;
      }
      const occurrence = await occurrenceForLegacyEntry(r, entry, salaries);
      if (occurrence === entry.occurrence) {
        history.push(entry);
        continue;
      }
      history.push({ ...entry, occurrence });
      dirty = true;
    }

    if (!dirty) continue;
    await db.recurrings.update(r.id, { history });
    changed++;
  }

  return changed;
}
