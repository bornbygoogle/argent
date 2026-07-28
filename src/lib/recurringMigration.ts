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

  // Deliberately unbounded by `createdAt`: that is the day the template was
  // typed into the app, not the day the bill came into existence. Clamping to
  // it forced every payment made before its first due day to claim the current
  // instalment — which is precisely the conflation this backfill undoes.
  return lastOccurrenceOnOrBefore(r, tx.date) ?? fallback;
}

/**
 * An entry whose instalment falls *after* the payment that supposedly settled
 * it. That cannot happen: settling early dates the transaction on the
 * instalment itself, so the two match. It only arises from a wrong attribution,
 * and recomputing such an entry can never disturb a correct one.
 */
async function isMisattributed(entry: RecurringHistoryEntry): Promise<boolean> {
  if (!entry.occurrence || !entry.transactionId) return false;
  const tx = await db.transactions.get(entry.transactionId);
  return !!tx?.date && entry.occurrence > tx.date;
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
