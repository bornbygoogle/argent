import { describe, it, expect } from 'vitest';
import { payAnchorDay, periodOf, periodBounds } from '@/lib/period';
import { daysInMonth } from '@/lib/date';
import type { Recurring, Transaction } from '@/types/models';

const rec = (over: Partial<Recurring> = {}): Recurring => ({
  id: 'r-1',
  accountId: 'acc-1',
  direction: 'income',
  label: 'Salary',
  amount: 2000,
  cadence: 'mensuel',
  icon: 'Wallet',
  color: '#000000',
  createdAt: '2026-01-01T00:00:00.000Z',
  history: [],
  ...over,
});

const pay = (date: string, over: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${date}`,
  kind: 'income',
  accountId: 'acc-1',
  amount: 2900,
  incomeType: 'Salaire',
  date,
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: `${date}T10:00:00.000Z`,
  ...over,
});

// Most people have no recurring template for their own pay — they log it when
// it lands. The payment itself is the better anchor anyway: it is what actually
// happened, where a template is only what was meant to.
describe('payAnchorDay from the salary that landed', () => {
  it('follows the day the last salary was paid', () => {
    expect(payAnchorDay([], [pay('2026-08-26')], '2026-08-27')).toBe(26);
  });

  it('takes the most recent one', () => {
    expect(
      payAnchorDay([], [pay('2026-07-28'), pay('2026-08-26')], '2026-08-27'),
    ).toBe(26);
  });

  it('ignores a salary dated in the future', () => {
    expect(payAnchorDay([], [pay('2026-07-28'), pay('2026-09-26')], '2026-08-27')).toBe(28);
  });

  it('ignores income that is not salary', () => {
    expect(
      payAnchorDay([], [pay('2026-08-26', { incomeType: 'Remboursement' })], '2026-08-27'),
    ).toBe(1);
    expect(payAnchorDay([], [pay('2026-08-26', { kind: 'expense' })], '2026-08-27')).toBe(1);
  });

  it('beats the template when the two disagree — the payment is what happened', () => {
    const template = rec({ dueDay: 5 });
    expect(payAnchorDay([template], [pay('2026-08-26')], '2026-08-27')).toBe(26);
  });

  it('falls back to the template when no salary has ever been logged', () => {
    expect(payAnchorDay([rec({ dueDay: 5 })], [], '2026-08-27')).toBe(5);
  });

  it('is the calendar month when the salary lands on the 1st', () => {
    expect(payAnchorDay([], [pay('2026-08-01')], '2026-08-27')).toBe(1);
  });
});

describe('payAnchorDay', () => {
  it('is the 1st when no income says otherwise — the calendar month, as before', () => {
    expect(payAnchorDay([])).toBe(1);
    expect(payAnchorDay([rec({ dueDay: undefined })])).toBe(1);
    expect(payAnchorDay([rec({ dueDay: 1 })])).toBe(1);
  });

  it('reads the due day of the monthly income', () => {
    expect(payAnchorDay([rec({ dueDay: 26 })])).toBe(26);
  });

  it('follows the biggest income when several are paid', () => {
    expect(
      payAnchorDay([rec({ id: 'a', amount: 400, dueDay: 5 }), rec({ id: 'b', amount: 2900, dueDay: 26 })]),
    ).toBe(26);
  });

  it('ignores expenses and anything that is not monthly', () => {
    expect(payAnchorDay([rec({ direction: 'expense', dueDay: 26 })])).toBe(1);
    expect(payAnchorDay([rec({ cadence: 'annuel', dueDay: 26 })])).toBe(1);
  });

  it('refuses a nonsense day rather than shifting the month by it', () => {
    expect(payAnchorDay([rec({ dueDay: 0 })])).toBe(1);
    expect(payAnchorDay([rec({ dueDay: 99 })])).toBe(1);
  });
});

describe('periodOf', () => {
  it('is the calendar month when payday is the 1st', () => {
    expect(periodOf('2026-08-01', 1)).toBe('2026-08');
    expect(periodOf('2026-08-31', 1)).toBe('2026-08');
  });

  it('sends money arriving on payday to the month it actually funds', () => {
    expect(periodOf('2026-08-26', 26)).toBe('2026-09');
    expect(periodOf('2026-08-31', 26)).toBe('2026-09');
  });

  it('leaves everything before payday in the month it is being spent', () => {
    expect(periodOf('2026-08-25', 26)).toBe('2026-08');
    expect(periodOf('2026-08-01', 26)).toBe('2026-08');
  });

  it('rolls the year over', () => {
    expect(periodOf('2026-12-28', 26)).toBe('2027-01');
  });

  it('clamps a payday past the end of a short month', () => {
    // Paid on the 31st means paid on the last day February has.
    expect(periodOf('2026-02-28', 31)).toBe('2026-03');
    expect(periodOf('2026-02-27', 31)).toBe('2026-02');
  });
});

describe('periodBounds', () => {
  it('runs from payday to the day before the next one', () => {
    expect(periodBounds('2026-09', 26)).toEqual({ start: '2026-08-26', end: '2026-09-26' });
  });

  it('is the plain calendar month when payday is the 1st', () => {
    expect(periodBounds('2026-08', 1)).toEqual({ start: '2026-08-01', end: '2026-09-01' });
  });

  it('clamps to the last day a short month has', () => {
    expect(periodBounds('2026-03', 31)).toEqual({ start: '2026-02-28', end: '2026-03-31' });
  });

  // The two must never disagree: a date inside the bounds is a date the budget
  // counts, and one outside is one it does not.
  it('agrees with periodOf on every day it contains', () => {
    for (const anchor of [1, 5, 26, 31]) {
      for (const month of ['2026-02', '2026-03', '2026-08', '2026-12', '2027-01']) {
        const { start, end } = periodBounds(month, anchor);
        for (const m of [start.slice(0, 7), end.slice(0, 7)]) {
          for (let d = 1; d <= daysInMonth(m); d++) {
            const date = `${m}-${String(d).padStart(2, '0')}`;
            expect([date, anchor, periodOf(date, anchor) === month]).toEqual([
              date,
              anchor,
              date >= start && date < end,
            ]);
          }
        }
      }
    }
  });
});
