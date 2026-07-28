// Which day of a month a recurring falls due on.
//
// Reactivation stays keyed to the calendar month: the day says *when* inside
// that month the bill lands, which orders the list and dates the transaction —
// it never decides whether the row is shown, because a bill due on the 30th is
// still the month's work on the 28th. The day is clamped at read time, never
// rewritten: a 31 stored against a February must still mean the 31st in March.
import { daysInMonth } from '@/lib/date';
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

