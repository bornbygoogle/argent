// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before '@/db/db'.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/db';
import {
  SALARY,
  cycleStart,
  periodBounds,
  periodOf,
  salaryDates,
  salaryDatesFrom,
} from '@/lib/period';
import { daysInMonth } from '@/lib/date';
import type { Transaction } from '@/types/models';

const income = (date: string, over: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${date}-${over.incomeType ?? SALARY}-${over.accountId ?? 'acc-1'}`,
  kind: 'income',
  accountId: 'acc-1',
  amount: 2900,
  incomeType: SALARY,
  date,
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: `${date}T10:00:00.000Z`,
  ...over,
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

// Pay cycles: a cycle starts at each income of type "Salaire" and lasts until the
// next one. No other income type opens a cycle.
describe('salaryDatesFrom', () => {
  it('salaryDatesFrom keeps only Salaire income, oldest first, one per date', () => {
    const txs = [
      income('2026-09-26'),
      income('2026-08-26'),
      income('2026-08-26', { id: 'dup', accountId: 'acc-2' }),
      income('2026-08-30', { incomeType: 'Remboursement' }),
      income('2026-08-31', { incomeType: 'Allocation' }),
    ];
    expect(salaryDatesFrom(txs)).toEqual(['2026-08-26', '2026-09-26']);
  });

  it('an expense dated like a Salaire opens no cycle', () => {
    expect(salaryDatesFrom([income('2026-08-26', { kind: 'expense' })])).toEqual([]);
  });

  it('salaries from different accounts share one timeline', () => {
    const txs = [
      income('2026-08-26', { accountId: 'acc-2' }),
      income('2026-07-28', { accountId: 'acc-1' }),
    ];
    const salaries = salaryDatesFrom(txs);
    expect(salaries).toEqual(['2026-07-28', '2026-08-26']);
    expect(periodOf('2026-08-01', salaries)).toBe('2026-07-28');
  });
});

describe('salaryDates', () => {
  it('salaryDates reads every account from the database, oldest first', async () => {
    await db.transactions.bulkAdd([
      income('2026-09-26', { accountId: 'acc-2' }),
      income('2026-08-26', { accountId: 'acc-1' }),
      income('2026-08-27', { incomeType: 'Remboursement' }),
    ]);
    expect(await salaryDates()).toEqual(['2026-08-26', '2026-09-26']);
  });

  it('is empty when no Salaire was ever logged', async () => {
    await db.transactions.bulkAdd([income('2026-08-27', { incomeType: 'Allocation' })]);
    expect(await salaryDates()).toEqual([]);
  });
});

describe('cycleStart', () => {
  it('is the latest Salaire on or before the date', () => {
    const s = ['2026-07-28', '2026-08-26'];
    expect(cycleStart('2026-08-26', s)).toBe('2026-08-26');
    expect(cycleStart('2026-08-25', s)).toBe('2026-07-28');
    expect(cycleStart('2026-07-27', s)).toBeUndefined();
    expect(cycleStart('2026-07-27', [])).toBeUndefined();
  });
});

describe('periodOf', () => {
  it('periodOf names a cycle after the Salaire that opened it', () => {
    const s = ['2026-08-26'];
    expect(periodOf('2026-08-26', s)).toBe('2026-08-26');
    expect(periodOf('2026-08-31', s)).toBe('2026-08-26');
    expect(periodOf('2026-10-15', s)).toBe('2026-08-26');
  });

  it('periodOf puts a date on a Salaire day in the cycle that Salaire opens', () => {
    const s = ['2026-07-28', '2026-08-26'];
    expect(periodOf('2026-08-26', s)).toBe('2026-08-26');
  });

  it('periodOf puts the day before a Salaire in the previous cycle', () => {
    const s = ['2026-07-28', '2026-08-26'];
    expect(periodOf('2026-08-25', s)).toBe('2026-07-28');
  });

  it('an early or late salary shifts only its own cycle', () => {
    const regular = ['2026-06-26', '2026-07-26', '2026-08-26'];
    const late = ['2026-06-26', '2026-07-31', '2026-08-26'];
    // 28 July is in July's cycle when the salary was on the 26th, in June's
    // when it landed late on the 31st.
    expect(periodOf('2026-07-28', regular)).toBe('2026-07-26');
    expect(periodOf('2026-07-28', late)).toBe('2026-06-26');
    // The neighbouring cycles do not move.
    expect(periodOf('2026-06-30', late)).toBe('2026-06-26');
    expect(periodOf('2026-08-26', late)).toBe('2026-08-26');
  });

  it('two Salaire dates in one calendar month give two cycles', () => {
    const s = ['2026-08-05', '2026-08-26'];
    expect(periodOf('2026-08-10', s)).toBe('2026-08-05');
    expect(periodOf('2026-08-30', s)).toBe('2026-08-26');
    expect(periodOf('2026-08-10', s)).not.toBe(periodOf('2026-08-30', s));
  });

  it('a Remboursement income opens no cycle', () => {
    const salaries = salaryDatesFrom([
      income('2026-08-26', { incomeType: 'Remboursement' }),
    ]);
    expect(periodOf('2026-08-27', salaries)).toBe('2026-08');
  });

  it('a monthly Allocation income opens no cycle', () => {
    const salaries = salaryDatesFrom([
      income('2026-07-05', { incomeType: 'Allocation' }),
      income('2026-08-05', { incomeType: 'Allocation' }),
    ]);
    expect(periodOf('2026-08-20', salaries)).toBe('2026-08');
  });

  it('periodOf is the calendar month when no Salaire exists', () => {
    expect(periodOf('2026-08-01', [])).toBe('2026-08');
    expect(periodOf('2026-08-31', [])).toBe('2026-08');
  });

  it('periodOf is the calendar month before the first Salaire', () => {
    expect(periodOf('2026-08-01', ['2026-08-26'])).toBe('2026-08');
  });

  it('periodOf of a date before the first Salaire stays in its calendar month', () => {
    const s = ['2026-08-26'];
    expect(periodOf('2026-08-25', s)).toBe('2026-08');
    expect(periodOf('2026-07-30', s)).toBe('2026-07');
  });

  it('a Salaire on the 1st opens a cycle that is the calendar month', () => {
    const s = ['2026-08-01', '2026-09-01'];
    expect(periodOf('2026-08-31', s)).toBe('2026-08-01');
    expect(periodBounds('2026-08-01', s)).toEqual({ start: '2026-08-01', end: '2026-09-01' });
  });
});

describe('periodBounds', () => {
  it('periodBounds runs from a Salaire to the next one', () => {
    const s = ['2026-08-26', '2026-09-28'];
    expect(periodBounds('2026-08-26', s)).toEqual({ start: '2026-08-26', end: '2026-09-28' });
  });

  it('periodBounds of the open cycle projects the next payday', () => {
    expect(periodBounds('2026-08-26', ['2026-08-26'])).toEqual({
      start: '2026-08-26',
      end: '2026-09-26',
    });
  });

  it('the open cycle projection clamps to a short month', () => {
    expect(periodBounds('2026-01-31', ['2026-01-31'])).toEqual({
      start: '2026-01-31',
      end: '2026-02-28',
    });
  });

  it('a cycle opened in December runs into January', () => {
    expect(periodBounds('2026-12-28', ['2026-12-28'])).toEqual({
      start: '2026-12-28',
      end: '2027-01-28',
    });
    expect(periodBounds('2026-12-28', ['2026-12-28', '2027-01-26'])).toEqual({
      start: '2026-12-28',
      end: '2027-01-26',
    });
  });

  it('periodBounds of a calendar month with no Salaire is the whole month', () => {
    expect(periodBounds('2026-08', [])).toEqual({ start: '2026-08-01', end: '2026-09-01' });
    expect(periodBounds('2026-02', [])).toEqual({ start: '2026-02-01', end: '2026-03-01' });
  });

  it('periodBounds of a calendar month ends at the first Salaire when it falls inside', () => {
    expect(periodBounds('2026-08', ['2026-08-26'])).toEqual({
      start: '2026-08-01',
      end: '2026-08-26',
    });
    // A Salaire in a later month leaves the month whole.
    expect(periodBounds('2026-07', ['2026-08-26'])).toEqual({
      start: '2026-07-01',
      end: '2026-08-01',
    });
  });

  // The two must never disagree: a date inside the bounds is a date the budget
  // counts, and one outside is one it does not.
  it('periodBounds agrees with periodOf on every day of a closed cycle', () => {
    const salaries = ['2026-07-31', '2026-08-05', '2026-08-26', '2026-12-28', '2027-01-26'];
    for (const key of salaries.slice(0, -1)) {
      const { start, end } = periodBounds(key, salaries);
      for (const m of ['2026-07', '2026-08', '2026-09', '2026-12', '2027-01', '2027-02']) {
        for (let d = 1; d <= daysInMonth(m); d++) {
          const date = `${m}-${String(d).padStart(2, '0')}`;
          expect([date, periodOf(date, salaries) === key]).toEqual([
            date,
            date >= start && date < end,
          ]);
        }
      }
    }
  });

  it('agrees with periodOf on every day of the calendar-month fallback', () => {
    const salaries = ['2026-08-26'];
    for (const key of ['2026-07', '2026-08']) {
      const { start, end } = periodBounds(key, salaries);
      for (let d = 1; d <= daysInMonth(key); d++) {
        const date = `${key}-${String(d).padStart(2, '0')}`;
        expect([date, periodOf(date, salaries) === key]).toEqual([
          date,
          date >= start && date < end,
        ]);
      }
    }
  });
});
