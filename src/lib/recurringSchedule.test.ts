import { describe, it, expect } from 'vitest';
import {
  clampedDay,
  dueDateFor,
  isDueYet,
  splitByDue,
} from '@/lib/recurringSchedule';

describe('clampedDay', () => {
  it('leaves a day the month can hold', () => {
    expect(clampedDay(15, '2026-07')).toBe(15);
  });

  it('clamps to the last day of a short month', () => {
    expect(clampedDay(31, '2026-02')).toBe(28);
    expect(clampedDay(31, '2026-04')).toBe(30);
  });

  it('gives February its 29th in a leap year', () => {
    expect(clampedDay(31, '2028-02')).toBe(29);
  });

  it('floors a nonsensical day at 1', () => {
    expect(clampedDay(0, '2026-07')).toBe(1);
    expect(clampedDay(-3, '2026-07')).toBe(1);
  });
});

describe('dueDateFor', () => {
  it('builds the ISO date for the given month', () => {
    expect(dueDateFor({ dueDay: 5 }, '2026-08')).toBe('2026-08-05');
  });

  it('falls back to the 1st when no day is set', () => {
    expect(dueDateFor({}, '2026-08')).toBe('2026-08-01');
  });

  it('clamps into a short month without rewriting the stored day', () => {
    const r = { dueDay: 31 };
    expect(dueDateFor(r, '2026-02')).toBe('2026-02-28');
    expect(dueDateFor(r, '2026-03')).toBe('2026-03-31');
  });
});

describe('isDueYet', () => {
  it('is false the day before', () => {
    expect(isDueYet({ dueDay: 5 }, '2026-08', '2026-08-04')).toBe(false);
  });

  it('is true on the day itself', () => {
    expect(isDueYet({ dueDay: 5 }, '2026-08', '2026-08-05')).toBe(true);
  });

  it('is true after the day', () => {
    expect(isDueYet({ dueDay: 5 }, '2026-08', '2026-08-09')).toBe(true);
  });

  it('is true for a month already past', () => {
    expect(isDueYet({ dueDay: 25 }, '2026-07', '2026-08-01')).toBe(true);
  });

  it('is false for a month still ahead', () => {
    expect(isDueYet({ dueDay: 1 }, '2026-09', '2026-08-31')).toBe(false);
  });

  it('is always true from the 1st when no day is set', () => {
    expect(isDueYet({}, '2026-08', '2026-08-01')).toBe(true);
  });
});

describe('splitByDue', () => {
  it('partitions and keeps input order inside each group', () => {
    const list: { id: string; dueDay?: number }[] = [
      { id: 'a', dueDay: 2 },
      { id: 'b', dueDay: 20 },
      { id: 'c', dueDay: 5 },
      { id: 'd', dueDay: 25 },
    ];
    const { due, upcoming } = splitByDue(list, '2026-08', '2026-08-06');
    expect(due.map((r) => r.id)).toEqual(['a', 'c']);
    expect(upcoming.map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('puts day-less entries in the due group', () => {
    const dayless: { id: string; dueDay?: number }[] = [{ id: 'a' }];
    const { due, upcoming } = splitByDue(dayless, '2026-08', '2026-08-01');
    expect(due).toHaveLength(1);
    expect(upcoming).toHaveLength(0);
  });
});
