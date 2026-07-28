// When a recurring falls due inside a month.
//
// Reactivation stays keyed to the calendar month — this module only answers
// "has its day arrived yet", so a bill due on the 25th does not sit in the
// to-do list from the 1st. The day is clamped at read time, never rewritten:
// a 31 stored against a February must still mean the 31st in March.
import { daysInMonth, todayISO } from '@/lib/date';
import type { Recurring } from '@/types/models';

/** Anything carrying an optional due day — the whole record is never needed. */
export type DueDayed = Pick<Recurring, 'dueDay'>;

/** The day, held inside the month's real length. */
export function clampedDay(dueDay: number, month: string): number {
  return Math.min(Math.max(Math.trunc(dueDay), 1), daysInMonth(month));
}

/** 'YYYY-MM-DD' the recurring falls due in `month`. No day set = the 1st. */
export function dueDateFor(r: DueDayed, month: string): string {
  const day = r.dueDay == null ? 1 : clampedDay(r.dueDay, month);
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** Has the due date arrived? ISO strings compare correctly across months,
 *  so a past month reads as due and a future one does not. */
export function isDueYet(r: DueDayed, month: string, today: string = todayISO()): boolean {
  return dueDateFor(r, month) <= today;
}

/** Split the unconfirmed into what is due now and what is still ahead. */
export function splitByDue<T extends DueDayed>(
  list: T[],
  month: string,
  today: string = todayISO(),
): { due: T[]; upcoming: T[] } {
  const due: T[] = [];
  const upcoming: T[] = [];
  for (const r of list) (isDueYet(r, month, today) ? due : upcoming).push(r);
  return { due, upcoming };
}
