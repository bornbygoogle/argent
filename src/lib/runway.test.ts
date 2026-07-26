import { describe, it, expect } from 'vitest';
import { computeRunway } from './runway';

// January: 31 days, so the arithmetic below is easy to check by hand.
const jan = (day: number) => new Date(2026, 0, day, 12, 0, 0);

describe('computeRunway', () => {
  it('reports what is left and what that is per remaining day', () => {
    // 10 Jan: 22 days left including today. 600 left / 22 = 27.27...
    const r = computeRunway(1000, 400, jan(10));
    expect(r.remaining).toBe(600);
    expect(r.daysLeft).toBe(22);
    expect(r.perDay).toBeCloseTo(600 / 22, 5);
  });

  it('treats the 1st as the start of the month, not a day already gone', () => {
    expect(computeRunway(1000, 0, jan(1)).monthRatio).toBe(0);
    expect(computeRunway(1000, 0, jan(1)).daysLeft).toBe(31);
  });

  it('flags spending that has outrun the calendar', () => {
    // Half the month gone, 80% of the money gone.
    const r = computeRunway(1000, 800, jan(16));
    expect(r.spentRatio).toBeCloseTo(0.8, 5);
    expect(r.monthRatio).toBeCloseTo(15 / 31, 5);
    expect(r.aheadOfPace).toBe(true);
    expect(r.over).toBe(false);
  });

  it('does NOT flag spending that is behind the calendar', () => {
    const r = computeRunway(1000, 200, jan(16));
    expect(r.aheadOfPace).toBe(false);
  });

  it('reports over-budget separately from ahead-of-pace', () => {
    const r = computeRunway(1000, 1200, jan(20));
    expect(r.over).toBe(true);
    expect(r.remaining).toBe(-200);
    // Already over: "ahead of pace" would be a redundant, weaker statement.
    expect(r.aheadOfPace).toBe(false);
    // Never suggest a daily allowance when there is nothing left.
    expect(r.perDay).toBe(0);
  });

  it('stays inert when no budget is set', () => {
    const r = computeRunway(0, 500, jan(10));
    expect(r.spentRatio).toBe(0);
    expect(r.aheadOfPace).toBe(false);
    expect(r.over).toBe(false);
  });

  it('clamps the spent ratio so the bar cannot overflow its track', () => {
    expect(computeRunway(100, 400, jan(10)).spentRatio).toBe(1);
  });

  it('handles the last day of the month', () => {
    const r = computeRunway(1000, 900, jan(31));
    expect(r.daysLeft).toBe(1);
    expect(r.perDay).toBeCloseTo(100, 5);
  });

  it('handles a short month', () => {
    // Feb 2026 has 28 days.
    const r = computeRunway(280, 0, new Date(2026, 1, 1, 12, 0, 0));
    expect(r.daysLeft).toBe(28);
    expect(r.perDay).toBeCloseTo(10, 5);
  });
});
