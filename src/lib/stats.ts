// Pure aggregation helpers for the Statistics + Monthly-overview screens.
// No i18n, no DB — operate on already-loaded transaction arrays.
import type { Transaction } from '@/types/models';

export interface MerchantStat {
  name: string;
  count: number;
  total: number;
}

/** Sum of expenses per day-of-month for a given 'YYYY-MM'. */
export function dailyExpenses(expenses: Transaction[], month: string): Map<number, number> {
  const map = new Map<number, number>();
  for (const t of expenses) {
    if (t.kind !== 'expense' || t.date.slice(0, 7) !== month) continue;
    const day = Number(t.date.slice(8, 10));
    map.set(day, (map.get(day) ?? 0) + t.amount);
  }
  return map;
}

export type HeatLevel = 'empty' | 'low' | 'mod' | 'high' | 'over';

/** Bucket a day's spend against the per-day budget slice (monthly / days). */
export function dayLevelBudget(spend: number, dailyBudget: number): HeatLevel {
  if (spend <= 0) return 'empty';
  const r = spend / dailyBudget;
  if (r >= 1) return 'over';
  if (r >= 0.66) return 'high';
  if (r >= 0.33) return 'mod';
  return 'low';
}

/** Relative bucketing when no monthly budget is set (bands against the month max). */
export function dayLevelRelative(spend: number, max: number): HeatLevel {
  if (spend <= 0 || max <= 0) return 'empty';
  const r = spend / max;
  if (r >= 0.85) return 'high';
  if (r >= 0.5) return 'mod';
  return 'low';
}

/** Top merchants by total expense magnitude. */
export function topMerchants(expenses: Transaction[], limit = 3): MerchantStat[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const t of expenses) {
    if (t.kind !== 'expense') continue;
    const name = t.merchant?.trim();
    if (!name) continue;
    const e = map.get(name) ?? { count: 0, total: 0 };
    e.count += 1;
    e.total += t.amount;
    map.set(name, e);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, count: v.count, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/** Total spent by the scoped transactions passed in (expenses only). */
export function spentTotal(ts: Transaction[]): number {
  return ts.reduce((acc, t) => acc + (t.kind === 'expense' ? t.amount : 0), 0);
}
