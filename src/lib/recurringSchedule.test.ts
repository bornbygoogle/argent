import { describe, it, expect, afterEach } from 'vitest';
import {
  clampedDay,
  dueDateFor,
  isOccurrencePaidIn,
  nextUnpaidOccurrence,
  paidMonths,
  periodKeyFor,
  recurringDueDays,
} from '@/lib/recurringSchedule';
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

// A monthly template settles per PAY CYCLE: two Salaire dates inside July make
// two cycles in one calendar month, and each holds its own instalment.
describe('pay-cycle settlement of a monthly template', () => {
  const SALARIES = ['2026-07-03', '2026-07-20'];
  const paidOn = (occurrence: string, n: number) => ({
    month: occurrence.slice(0, 7),
    amount: 100,
    transactionId: `tx-${n}`,
    occurrence,
  });
  const cyclic = (occurrences: string[] = []) =>
    rec({
      dueDay: 22,
      createdAt: '2026-07-02T12:00:00.000Z',
      history: occurrences.map(paidOn),
    });

  it('keys a monthly date to the cycle it falls in, others to the calendar month', () => {
    expect(periodKeyFor({ cadence: 'mensuel' }, '2026-07-25', SALARIES)).toBe('2026-07-20');
    expect(periodKeyFor({ cadence: 'mensuel' }, '2026-07-01', SALARIES)).toBe('2026-07');
    expect(periodKeyFor({ cadence: 'mensuel' }, '2026-07-25', [])).toBe('2026-07');
    expect(periodKeyFor({ cadence: 'hebdo' }, '2026-07-25', SALARIES)).toBe('2026-07');
    expect(periodKeyFor({ cadence: 'annuel' }, '2026-07-25', SALARIES)).toBe('2026-07');
  });

  it('files a paid instalment under its cycle, not its calendar month', () => {
    expect(paidMonths(cyclic(['2026-07-03', '2026-07-22']), SALARIES)).toEqual(
      new Set(['2026-07-03', '2026-07-20']),
    );
  });

  it('reads a calendar month as paid only once every cycle in it is paid', () => {
    expect(isOccurrencePaidIn(cyclic(['2026-07-03']), '2026-07', SALARIES)).toBe(false);
    expect(isOccurrencePaidIn(cyclic(['2026-07-22']), '2026-07', SALARIES)).toBe(false);
    expect(isOccurrencePaidIn(cyclic(['2026-07-03', '2026-07-22']), '2026-07', SALARIES)).toBe(true);
  });

  it('still reads the calendar month when there is no Salaire', () => {
    expect(isOccurrencePaidIn(cyclic(['2026-07-03']), '2026-07')).toBe(true);
  });

  it('owes the first cycle of the month, then the second once the first is paid', () => {
    expect(nextUnpaidOccurrence(cyclic(), '2026-07-25', SALARIES)).toBe('2026-07-03');
    expect(nextUnpaidOccurrence(cyclic(['2026-07-03']), '2026-07-25', SALARIES)).toBe('2026-07-22');
  });

  it('counts a backdated entry against the cycle its date falls in', () => {
    // Typed whenever, dated 5 July: that fills the cycle opened on 3 July.
    expect(nextUnpaidOccurrence(cyclic(['2026-07-05']), '2026-07-25', SALARIES)).toBe('2026-07-22');
  });

  it('reads a cycle as owed while a sibling cycle of the same month is paid', () => {
    const r = cyclic(['2026-07-22']);
    expect(nextUnpaidOccurrence(r, '2026-07-25', SALARIES)).toBe('2026-07-03');
  });

  it('settles the current cycle again, idempotently, once everything is paid', () => {
    const r = cyclic(['2026-07-03', '2026-07-22']);
    expect(nextUnpaidOccurrence(r, '2026-07-25', SALARIES)).toBe('2026-07-22');
  });

  it('falls back to one instalment per calendar month before the first Salaire', () => {
    const r = rec({
      dueDay: 5,
      createdAt: '2026-06-02T12:00:00.000Z',
      history: [paidOn('2026-06-05', 1)],
    });
    expect(nextUnpaidOccurrence(r, '2026-07-25', ['2026-07-20'])).toBe('2026-07-05');
  });
});

describe('a yearly template', () => {
  const insurance = (history: Recurring['history'] = []) =>
    rec({ cadence: 'annuel', dueDay: 12, createdAt: '2025-11-03T12:00:00.000Z', history });

  it('is owed only in its anniversary month, never in every month', () => {
    const paidLastYear = insurance([
      { month: '2025-11', amount: 100, transactionId: 'tx-1', occurrence: '2025-11-12' },
    ]);
    // December 2025 .. August 2026 owe nothing: the next instalment is November's.
    expect(nextUnpaidOccurrence(paidLastYear, '2026-08-15')).toBe('2026-11-12');
  });

  it('owes the anniversary instalment it never paid', () => {
    expect(nextUnpaidOccurrence(insurance(), '2026-08-15')).toBe('2025-11-12');
  });
});

describe('the creation day is judged on the local calendar', () => {
  const realTZ = process.env.TZ;
  afterEach(() => {
    if (realTZ === undefined) delete process.env.TZ;
    else process.env.TZ = realTZ;
  });

  it('does not owe an instalment dated the UTC day before the local creation day', () => {
    process.env.TZ = 'Pacific/Auckland'; // UTC+12/13: local 1 Aug is still 31 Jul in UTC
    const created = new Date(2026, 7, 1, 0, 30, 0).toISOString();
    expect(created.slice(0, 10)).toBe('2026-07-31');

    const r = rec({ dueDay: 31, createdAt: created });
    // 31 July predates the template on the user's calendar, so it is not owed.
    expect(nextUnpaidOccurrence(r, '2026-08-01')).toBe('2026-08-31');
    // And the calendar dots start in the month it was created on that calendar.
    expect(recurringDueDays([r], '2026-07')).toEqual(new Set());
  });
});
