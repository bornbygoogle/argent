// Backfill: teach old history entries which instalment they actually paid.
//
// Before occurrences existed an entry recorded only the month in which the
// button was pressed, and nothing tied it to the money that moved. The
// transaction carries the date it was logged, so the instalment can be
// recovered rather than guessed.
//
// The instalment is the one falling in the *transaction's own month*, and that
// is not a shortcut for "the month on the entry". A payment is an instalment
// because money moved, and everything downstream counts that money by the
// calendar month it moved in: the ceiling in confirmRecurring and the repair in
// lib/recurringDedupe both allow one transaction per template per month. An
// occurrence pointing at any other month therefore describes a payment that
// does not exist — the month it names reads settled with no money in it, and
// the month holding the money reads owed and jams, because the ceiling counts
// the transaction sitting there and refuses to write a second.
//
// The pass never rewrites `month`, and it is idempotent: an entry whose
// occurrence already falls in its payment's month is left untouched.
import { db } from '@/db/db';
import { dueDateFor } from '@/lib/recurringSchedule';
import type { Recurring, RecurringHistoryEntry } from '@/types/models';

/** The instalment a legacy entry settled, from the date its transaction carries. */
export async function occurrenceForLegacyEntry(
  r: Recurring,
  entry: RecurringHistoryEntry,
): Promise<string> {
  const fallback = dueDateFor(r, entry.month);
  if (!entry.transactionId) return fallback;

  const tx = await db.transactions.get(entry.transactionId);
  // A deleted transaction leaves nothing to reason from; the month's own due
  // date is exactly what the entry used to mean, so nothing changes.
  if (!tx?.date) return fallback;

  return dueDateFor(r, tx.date.slice(0, 7));
}

/**
 * An entry attributed to an instalment outside the month its payment sits in.
 *
 * Either direction is wrong and for the same reason: the money moved once, in
 * one month, and that month is the one the instalment belongs to. Recomputing
 * such an entry can never disturb a correct one.
 */
async function isMisattributed(entry: RecurringHistoryEntry): Promise<boolean> {
  if (!entry.occurrence || !entry.transactionId) return false;
  const tx = await db.transactions.get(entry.transactionId);
  return !!tx?.date && tx.date.slice(0, 7) !== entry.occurrence.slice(0, 7);
}

/**
 * Give every history entry the instalment it actually settled: filling the gap
 * on entries that predate occurrences, and repairing any that were attributed
 * wrongly. Returns how many templates changed.
 */
export async function backfillOccurrences(): Promise<number> {
  const recurrings = await db.recurrings.toArray();
  let changed = 0;

  for (const r of recurrings) {
    let dirty = false;
    const history: RecurringHistoryEntry[] = [];

    for (const entry of r.history) {
      if (entry.occurrence !== undefined && !(await isMisattributed(entry))) {
        history.push(entry);
        continue;
      }
      history.push({ ...entry, occurrence: await occurrenceForLegacyEntry(r, entry) });
      dirty = true;
    }

    if (!dirty) continue;
    await db.recurrings.update(r.id, { history });
    changed++;
  }

  return changed;
}
