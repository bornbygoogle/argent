// Pure date/month arithmetic — no i18n dependency, locale passed at format time.

/** 'YYYY-MM' from a 'YYYY-MM-DD' string or Date. */
export function monthOf(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return value.slice(0, 7);
}

/** Previous month ('YYYY-MM'). */
export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Next month ('YYYY-MM'). */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Today's date as 'YYYY-MM-DD' (local). */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function currentMonth(): string {
  return monthOf(todayISO());
}

/** Today shifted by `offset` days (negative = past), as 'YYYY-MM-DD' (local). */
export function addDaysISO(offset: number): string {
  return addDays(todayISO(), offset);
}

/** 'YYYY-MM-DD' of an ISO instant on the LOCAL calendar (same basis as
 *  todayISO). `iso.slice(0, 10)` is the UTC date, a day off near midnight. */
export function localDateOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const DAY_MS = 86_400_000;

/** UTC midnight (ms) of a 'YYYY-MM-DD' date. */
export function utcDay(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

/** A 'YYYY-MM-DD' date shifted by `days` calendar days. */
export function addDays(date: string, days: number): string {
  return new Date(utcDay(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Number of days in a given 'YYYY-MM'. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Elapsed days so far in the current month (for daily-average denominator). */
export function elapsedDaysInMonth(month: string): number {
  if (month !== currentMonth()) return daysInMonth(month);
  return new Date().getDate();
}

/** Weekday index with Monday = 0 (used by heat-map + stats). */
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Is a date string today? */
export function isToday(iso: string): boolean {
  return iso === todayISO();
}
