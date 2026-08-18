import { describe, it, expect } from 'vitest';
import { clampedDay, dueDateFor, recurringDueDays } from '@/lib/recurringSchedule';
import type { Recurring } from '@/types/models';

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

const rec = (over: Partial<Recurring> = {}): Recurring => ({
  id: 'r1',
  accountId: 'acc-1',
  direction: 'expense',
  label: 'Rent',
  amount: 100,
  cadence: 'mensuel',
  icon: 'Home',
  color: '#7C3AED',
  createdAt: '2026-01-10T00:00:00.000Z',
  history: [],
  ...over,
});

describe('recurringDueDays', () => {
  it('marks the day a monthly charge falls due', () => {
    expect(recurringDueDays([rec({ dueDay: 5 })], '2026-08')).toEqual(new Set([5]));
  });

  it('marks the 1st when the charge has no due day', () => {
    expect(recurringDueDays([rec()], '2026-08')).toEqual(new Set([1]));
  });

  it('clamps a 31 into the last day a short month has', () => {
    expect(recurringDueDays([rec({ dueDay: 31 })], '2026-02')).toEqual(new Set([28]));
  });

  it('collects every charge of the month into one set', () => {
    const days = recurringDueDays(
      [rec({ id: 'r1', dueDay: 5 }), rec({ id: 'r2', dueDay: 20 }), rec({ id: 'r3', dueDay: 5 })],
      '2026-08',
    );
    expect(days).toEqual(new Set([5, 20]));
  });

  it('marks an annual charge only in the month it was taken out', () => {
    const insurance = rec({ cadence: 'annuel', dueDay: 12, createdAt: '2025-11-03T00:00:00.000Z' });
    expect(recurringDueDays([insurance], '2026-11')).toEqual(new Set([12]));
    expect(recurringDueDays([insurance], '2026-08')).toEqual(new Set());
  });

  it('marks nothing in a month before the charge existed', () => {
    expect(recurringDueDays([rec({ dueDay: 5 })], '2025-12')).toEqual(new Set());
  });

  it('marks the month the charge was created in', () => {
    expect(recurringDueDays([rec({ dueDay: 5 })], '2026-01')).toEqual(new Set([5]));
  });

  it('ignores incoming charges — only expenses are marked', () => {
    expect(recurringDueDays([rec({ direction: 'income', dueDay: 5 })], '2026-08')).toEqual(new Set());
  });
});
