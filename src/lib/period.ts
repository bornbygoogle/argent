// The month a budget actually runs on.
//
// A calendar month only works if the money arrives on the 1st. Paid on the
// 26th, the salary that lands in August is September's money — and charging
// August's spending against it reads as "over budget" the instant it is
// logged, which is the opposite of what just happened.
//
// So the budget month runs payday to payday, and is named after the month it
// funds: paid 26 August, the period 26 Aug – 25 Sep is '2026-09'. With payday
// on the 1st — the default, and what every anchor-less caller gets — a period
// is exactly its calendar month and none of this is visible.
import { daysInMonth, nextMonth, prevMonth, todayISO } from '@/lib/date';
import type { Recurring, Transaction } from '@/types/models';

/** The seeded income type for pay. Its key is fixed; only its label is translated. */
const SALARY = 'Salaire';

/** The day the last salary actually landed, 0 if none ever has. */
function lastPaydayDay(transactions: Transaction[], today: string): number {
  let latest = '';
  for (const t of transactions) {
    if (t.kind !== 'income' || t.incomeType !== SALARY) continue;
    // A salary dated ahead of today has not been paid yet, whatever the row says.
    if (t.date <= today && t.date > latest) latest = t.date;
  }
  return latest ? Number(latest.slice(8, 10)) : 0;
}

/**
 * The day of the month the money arrives. 1 (the default) means plain calendar
 * months, which is what everything falls back to.
 *
 * The salary that actually landed wins: most people have no recurring template
 * for their own pay, and where both exist the payment is what happened while
 * the template is only what was meant to. Nothing is stored for this — both
 * sources are already in the data and cannot drift from it.
 */
export function payAnchorDay(
  recurrings: Recurring[],
  transactions: Transaction[] = [],
  today: string = todayISO(),
): number {
  const paid = lastPaydayDay(transactions, today);
  const due = recurrings
    .filter((r) => r.direction === 'income' && r.cadence === 'mensuel')
    .sort((a, b) => b.amount - a.amount)
    .find((r) => (r.dueDay ?? 1) > 1)?.dueDay;
  const day = paid || due || 1;
  return day >= 2 && day <= 31 ? day : 1;
}

/** Payday clamped to a month that may be too short to have that day. */
const paydayIn = (month: string, anchor: number): string =>
  `${month}-${String(Math.min(anchor, daysInMonth(month))).padStart(2, '0')}`;

/** The budget month a 'YYYY-MM-DD' belongs to. */
export function periodOf(date: string, anchor: number): string {
  const month = date.slice(0, 7);
  if (anchor <= 1) return month;
  return date >= paydayIn(month, anchor) ? nextMonth(month) : month;
}

/** A budget month as dates: `start` inclusive, `end` exclusive. */
export function periodBounds(month: string, anchor: number): { start: string; end: string } {
  if (anchor <= 1) return { start: `${month}-01`, end: `${nextMonth(month)}-01` };
  return { start: paydayIn(prevMonth(month), anchor), end: paydayIn(month, anchor) };
}
