// Backfill: teach old history entries which instalment they actually paid.
//
// Before occurrences existed an entry recorded only the month in which the
// button was pressed. That is not the same thing as the instalment settled: a
// bill due on the 30th, logged on the 10th, was paying the *previous* month's.
// The transaction carries the date it was logged, so the instalment can be
// recovered rather than guessed.
//
// The pass is additive and idempotent: it only ever fills in a missing
// `occurrence`, never rewrites `month` and never touches an entry twice, so it
// is safe to run on every start.
import { db } from '@/db/db';
import { dueDateFor, lastOccurrenceOnOrBefore } from '@/lib/recurringSchedule';
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

  return lastOccurrenceOnOrBefore(r, tx.date, r.createdAt.slice(0, 10)) ?? fallback;
}

/** Fill in `occurrence` wherever it is missing. Returns how many rows changed. */
export async function backfillOccurrences(): Promise<number> {
  const recurrings = await db.recurrings.toArray();
  let changed = 0;

  for (const r of recurrings) {
    if (r.history.every((h) => h.occurrence !== undefined)) continue;

    const history: RecurringHistoryEntry[] = [];
    for (const entry of r.history) {
      history.push(
        entry.occurrence !== undefined
          ? entry
          : { ...entry, occurrence: await occurrenceForLegacyEntry(r, entry) },
      );
    }
    await db.recurrings.update(r.id, { history });
    changed++;
  }

  return changed;
}
