// The pay cycle a budget actually runs on.
//
// A calendar month only works if the money arrives on the 1st. So the budget
// runs in PAY CYCLES: a cycle starts at each income of type 'Salaire' and lasts
// until the next one. No other income type opens a cycle. The cycles come from
// the Salaire transactions that actually landed — across all accounts, since a
// cycle belongs to the person's timeline, not to one account — so a salary that
// arrives early or late moves only its own cycle, and a calendar month can hold
// two cycles.
//
// A cycle is named after the Salaire date that opened it: paid 26 August, the
// cycle is '2026-08-26'. Before the first Salaire, and wherever no Salaire
// exists, time falls back to plain calendar months, named 'YYYY-MM'.
import { db } from '@/db/db';
import { daysInMonth, nextMonth } from '@/lib/date';
import type { Transaction } from '@/types/models';

/** The seeded income type that opens a pay cycle. Its key is fixed; only its label is translated. */
export const SALARY = 'Salaire';

/** Every Salaire date in `transactions`, oldest first, one per date. */
export function salaryDatesFrom(transactions: Transaction[]): string[] {
  const pays = transactions.filter((t) => t.kind === 'income' && t.incomeType === SALARY);
  return [...new Set(pays.map((t) => t.date))].sort();
}

/**
 * Every Salaire date, oldest first, across ALL accounts. A pay cycle belongs to
 * the person's timeline, not to one account.
 */
export async function salaryDates(): Promise<string[]> {
  const pays = await db.transactions
    .filter((t) => t.kind === 'income' && t.incomeType === SALARY)
    .toArray();
  return salaryDatesFrom(pays);
}

/** The latest Salaire dated on or before `date`, if any. */
export function cycleStart(date: string, salaries: string[]): string | undefined {
  let start: string | undefined;
  for (const s of salaries) {
    if (s > date) break;
    start = s;
  }
  return start;
}

/** The period a 'YYYY-MM-DD' belongs to: the Salaire that opened its cycle
 *  ('YYYY-MM-DD'), or its calendar month ('YYYY-MM') before the first one. */
export function periodOf(date: string, salaries: string[]): string {
  return cycleStart(date, salaries) ?? date.slice(0, 7);
}

/** The same day of month in the month after `date`, clamped to that month's length. */
function sameDayNextMonth(date: string): string {
  const month = nextMonth(date.slice(0, 7));
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(month));
  return `${month}-${String(day).padStart(2, '0')}`;
}

/**
 * A period as dates: `start` inclusive, `end` exclusive.
 *
 * A cycle runs from its Salaire to the next one; the open cycle has no next
 * Salaire yet, so its end is projected one month on. A calendar month ends at
 * the first Salaire falling inside it, else at the 1st of the next month.
 */
export function periodBounds(
  period: string,
  salaries: string[],
): { start: string; end: string } {
  if (period.length > 7) {
    const next = salaries.find((s) => s > period);
    return { start: period, end: next ?? sameDayNextMonth(period) };
  }
  const start = `${period}-01`;
  const monthEnd = `${nextMonth(period)}-01`;
  const next = salaries.find((s) => s > start);
  return { start, end: next && next < monthEnd ? next : monthEnd };
}
