// Repair: collapse a month back to the single instalment it owes.
//
// Editing a template's due day makes an already-settled month read as unpaid
// again, so "Log" offers itself a second time for a month that is already done.
// Repeated edits did that without limit, and each press wrote another real
// transaction — a month could end up holding four or five copies of one bill.
//
// The ceiling is one, because that is what the schedule itself says: dueDateFor
// yields exactly one date per month and paidMonths keys settlement by month, so
// a second instalment is never an instalment — it is a double charge. An earlier
// ceiling of two treated one re-log as a tolerable cost of editing the day; it
// is not. Real data carried 620 € of such "tolerated" copies, every one of them
// skipped by this pass for sitting exactly at the old limit.
//
// Which copy survives: the earliest *by saved date*, since that is the one
// logged deliberately and the later ones are the re-logs. Except where history
// names a different copy — keeping a row history does not name would leave the
// month reading unsettled while still holding its charge, stranding it in
// "To confirm" with nothing left to log.
//
// Deliberately driven by the transactions rather than by history: the losing
// writes of a concurrent double-press left transactions no history entry names,
// and those are exactly the copies no screen can reach to delete.
import { db } from '@/db/db';
import type { Transaction } from '@/types/models';

/** How many instalments of one template may share a month. */
export const MAX_PER_MONTH = 1;

/** Oldest saved first. Ties broken on id so a rerun makes the same choice —
 *  the concurrent-press race stamps every row the same millisecond. */
const bySavedDate = (a: Transaction, b: Transaction): number => {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : 1;
};

const groupByMonth = (rows: Transaction[]): Map<string, Transaction[]> => {
  const m = new Map<string, Transaction[]>();
  for (const t of rows) {
    const month = t.date.slice(0, 7);
    const arr = m.get(month) ?? [];
    arr.push(t);
    m.set(month, arr);
  }
  return m;
};

/**
 * The doomed rows plus every leg that travels with them.
 *
 * A charge naming a receiver settles as a transfer, and only its outgoing leg
 * carries the template — so that leg is all this pass can see. Deleting it
 * alone would leave the incoming leg standing: a credit in the receiver that
 * no account ever paid, belonging to no template, reachable from no screen.
 * A duplicate is a duplicate transfer, so it goes whole.
 */
async function withTransferSiblings(rows: Transaction[]): Promise<string[]> {
  const ids = new Set(rows.map((t) => t.id));
  const groups = [...new Set(rows.map((t) => t.transferGroupId).filter(Boolean))] as string[];
  for (const group of groups) {
    const legs = await db.transactions.where('transferGroupId').equals(group).toArray();
    for (const leg of legs) ids.add(leg.id);
  }
  return [...ids];
}

/**
 * Delete every instalment past the ceiling, month by month and template by
 * template, keeping one. Returns how many transactions were removed.
 *
 * Idempotent — once a month is back at or under the ceiling it is left alone,
 * so this is safe to run on every start.
 */
export async function dedupeRecurringMonths(): Promise<number> {
  const recurrings = await db.recurrings.toArray();
  let deleted = 0;

  for (const r of recurrings) {
    const rows = await db.transactions.where('recurringSourceId').equals(r.id).toArray();
    const named = new Set(r.history.map((h) => h.transactionId).filter(Boolean));

    const losers: Transaction[] = [];
    for (const group of groupByMonth(rows).values()) {
      if (group.length <= MAX_PER_MONTH) continue;
      const ordered = [...group].sort(bySavedDate);
      const survivor = ordered.find((t) => named.has(t.id)) ?? ordered[0];
      losers.push(...ordered.filter((t) => t.id !== survivor.id));
    }
    if (losers.length === 0) continue;

    const doomed = await withTransferSiblings(losers);

    const removed = new Set(doomed);
    // History entries are dropped only for the transactions this pass deleted.
    // An entry whose transaction the user removed by hand is left alone: it
    // still means "this month is settled", and clearing it would reopen the
    // month and invite the duplicate all over again.
    const history = r.history.filter((h) => !h.transactionId || !removed.has(h.transactionId));

    await db.transaction('rw', db.transactions, db.recurrings, async () => {
      await db.transactions.bulkDelete(doomed);
      if (history.length !== r.history.length) {
        await db.recurrings.update(r.id, { history });
      }
    });

    deleted += doomed.length;
  }

  return deleted;
}
