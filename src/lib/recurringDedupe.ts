// Repair: collapse a month back to the single instalment it owes.
//
// Editing a template's due day makes an already-settled month read as unpaid
// again, so "Log" offers itself a second time for a month that is already done.
// Repeated edits did that without limit, and each press wrote another real
// transaction — a month could end up holding four or five copies of one bill.
//
// The ceiling is one per PAY CYCLE for a monthly template: a cycle opens at each
// 'Salaire' income (taken across all accounts) and lasts until the next, so one
// calendar month can legitimately hold two entries, one in each cycle. Before
// the first Salaire, and for weekly and yearly templates, it falls back to one
// per calendar month. Two entries inside one cycle are a double charge: a
// second instalment there is never an instalment. An earlier
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
import { cycleStart, salaryDates } from '@/lib/period';
import type { Recurring, Transaction } from '@/types/models';

/** How many instalments of one template may share a pay cycle (monthly
 *  templates) or a calendar month (weekly, yearly, or before the first Salaire). */
export const MAX_PER_MONTH = 1;

/** Oldest saved first. Ties broken on id so a rerun makes the same choice —
 *  the concurrent-press race stamps every row the same millisecond. */
const bySavedDate = (a: Transaction, b: Transaction): number => {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : 1;
};

/**
 * Group instalments by the unit the ceiling applies to: the pay cycle for a
 * monthly template, the calendar month otherwise — and for a monthly row dated
 * before the first Salaire. The key prefixes keep the two spaces apart.
 */
const groupByCeilingUnit = (
  rows: Transaction[],
  cadence: Recurring['cadence'],
  salaries: string[],
): Map<string, Transaction[]> => {
  const m = new Map<string, Transaction[]>();
  for (const t of rows) {
    const start = cadence === 'mensuel' ? cycleStart(t.date, salaries) : undefined;
    const key = start ? `cycle:${start}` : `month:${t.date.slice(0, 7)}`;
    const arr = m.get(key) ?? [];
    arr.push(t);
    m.set(key, arr);
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
 * Delete every instalment past the ceiling, pay cycle by pay cycle (calendar
 * month by calendar month for weekly and yearly templates, and before the first
 * Salaire) and template by template, keeping one. Returns how many
 * transactions were removed.
 *
 * Idempotent — once a cycle is back at or under the ceiling it is left alone,
 * so this is safe to run on every start.
 */
export async function dedupeRecurringMonths(): Promise<number> {
  const recurrings = await db.recurrings.toArray();
  const salaries = await salaryDates();
  let deleted = 0;

  for (const r of recurrings) {
    const rows = await db.transactions.where('recurringSourceId').equals(r.id).toArray();
    const named = new Set(r.history.map((h) => h.transactionId).filter(Boolean));

    const losers: Transaction[] = [];
    for (const group of groupByCeilingUnit(rows, r.cadence, salaries).values()) {
      if (group.length <= MAX_PER_MONTH) continue;
      const ordered = [...group].sort(bySavedDate);
      const survivor = ordered.find((t) => named.has(t.id)) ?? ordered[0];
      losers.push(...ordered.filter((t) => t.id !== survivor.id));
    }
    if (losers.length === 0) continue;

    const doomed = await withTransferSiblings(losers);

    const removed = new Set(doomed);
    // History entries are dropped only for the transactions this pass deleted.
    // A transaction the user removes by hand is no longer this pass's concern:
    // deleteTransaction / deleteTransfer clear the entry that names it in the
    // same db transaction, so the instalment reopens and can be logged again.
    // That is safe because confirmRecurring now enforces one instalment per PAY
    // CYCLE, counting the real transactions by the cycle their DATE falls in. A
    // re-log after a hand delete therefore creates exactly one charge and a
    // second press is refused. The old rule (leave the entry, since clearing it
    // would "invite the duplicate") guarded against a calendar-month ceiling
    // that leaked and let 620 EUR of re-log copies through; that ceiling is gone.
    // Entries already dangling from hand deletes made before this rule are left
    // as stored: this pass never reconciles them, and adds no startup repair.
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
