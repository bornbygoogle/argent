import { describe, it, expect } from 'vitest';
import { clampedDay, dueDateFor } from '@/lib/recurringSchedule';

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
