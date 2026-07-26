// "What can I still spend?" — the question the home screen exists to answer.
//
// A balance does not answer it: a healthy balance on the 28th with nothing
// budgeted left is not the same situation as the same balance on the 2nd.
// Runway compares two ratios that are only meaningful together:
//   spent / budget   — how far through the money you are
//   elapsed / days   — how far through the month you are
// Spending ahead of the calendar is the thing worth knowing at a glance.

export interface Runway {
  /** Budget minus spent. Negative means over budget. */
  remaining: number;
  budget: number;
  spent: number;
  /** 0..1, clamped. Share of the budget already spent. */
  spentRatio: number;
  /** 0..1. Share of the month already elapsed. */
  monthRatio: number;
  /** Whole days left in the month, including today. */
  daysLeft: number;
  /** What's left, divided across the days left. */
  perDay: number;
  /** True when spending has outrun the calendar. */
  aheadOfPace: boolean;
  /** True when the budget is blown. */
  over: boolean;
}

/**
 * @param budget total monthly budget across the accounts in scope (0 = unset)
 * @param spent  expenses so far this month in the same scope
 * @param now    the reference date — injected so this is testable
 */
export function computeRunway(budget: number, spent: number, now: Date): Runway {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1);
  // Elapsed counts completed days, so the 1st reads as "start of month", not 1/31 gone.
  const monthRatio = (dayOfMonth - 1) / daysInMonth;

  const remaining = budget - spent;
  const spentRatio = budget > 0 ? Math.min(1, Math.max(0, spent / budget)) : 0;

  return {
    remaining,
    budget,
    spent,
    spentRatio,
    monthRatio,
    daysLeft,
    perDay: remaining > 0 ? remaining / daysLeft : 0,
    // Only meaningful once a budget exists and the month has actually started.
    aheadOfPace: budget > 0 && spentRatio > monthRatio && remaining > 0,
    over: budget > 0 && remaining < 0,
  };
}
