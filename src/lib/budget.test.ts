import { describe, it, expect } from 'vitest';
import { monthlyEquivalent, computeAutoBudget, upcomingCommitments, variableExpenses } from '@/lib/budget';
import type { Recurring, Transaction } from '@/types/models';

const MONTH = '2026-07';
// A Thursday: July 2026 holds five of them (2, 9, 16, 23, 30).
const WEEKLY_CREATED = '2026-01-01T12:00:00.000Z';

const rec = (over: Partial<Recurring> = {}): Recurring => ({
  id: 'r-1',
  accountId: 'acc-1',
  direction: 'expense',
  label: 'Rent',
  amount: 600,
  cadence: 'mensuel',
  icon: 'Home',
  color: '#000000',
  createdAt: '2026-01-01T00:00:00.000Z',
  history: [],
  ...over,
});

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  kind: 'expense',
  accountId: 'acc-1',
  amount: 20,
  date: '2026-07-10',
  createdAt: '2026-07-10T10:00:00.000Z',
  updatedAt: '2026-07-10T10:00:00.000Z',
  ...over,
});

// The derived budget has already had the recurring commitments taken out of it.
// Counting them again as spending would subtract the same rent twice and
// under-report what is left by exactly that amount.
describe('variableExpenses', () => {
  it('keeps ordinary expenses', () => {
    const list = [tx({ id: 'a' }), tx({ id: 'b' })];
    expect(variableExpenses(list).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('drops expenses that came from confirming a recurring', () => {
    const list = [tx({ id: 'a' }), tx({ id: 'rent', recurringSourceId: 'r-1' })];
    expect(variableExpenses(list).map((t) => t.id)).toEqual(['a']);
  });

  it('drops income and transfers — only expenses count against a spending budget', () => {
    const list = [
      tx({ id: 'a' }),
      tx({ id: 'salary', kind: 'income' }),
      tx({ id: 'trf', kind: 'transfer', transferGroupId: 'g1' }),
    ];
    expect(variableExpenses(list).map((t) => t.id)).toEqual(['a']);
  });

  it('returns an empty list when everything is recurring', () => {
    expect(variableExpenses([tx({ recurringSourceId: 'r-1' })])).toEqual([]);
  });
});

describe('monthlyEquivalent', () => {
  it('leaves a monthly amount alone', () => {
    expect(monthlyEquivalent(600, 'mensuel')).toBe(600);
  });

  it('spreads an annual amount over twelve months', () => {
    expect(monthlyEquivalent(1200, 'annuel')).toBe(100);
  });

  it('converts a weekly amount using 52 weeks a year, not 4 weeks a month', () => {
    // 30 * 52 / 12 = 130, where 30 * 4 would understate it by 10 a month.
    expect(monthlyEquivalent(30, 'hebdo')).toBe(130);
  });

  it('rounds to cents', () => {
    expect(monthlyEquivalent(10, 'hebdo')).toBe(43.33);
  });

  it('treats zero as zero for every cadence', () => {
    for (const c of ['mensuel', 'hebdo', 'annuel'] as const) {
      expect(monthlyEquivalent(0, c)).toBe(0);
    }
  });
});

describe('computeAutoBudget', () => {
  it('is the income when there is nothing recurring', () => {
    const b = computeAutoBudget(2450, [], MONTH);
    expect(b).toMatchObject({ income: 2450, recurringExpenses: 0, total: 2450 });
  });

  it('subtracts recurring expenses from income', () => {
    const b = computeAutoBudget(2450, [rec({ amount: 600 })], MONTH);
    expect(b.recurringExpenses).toBe(600);
    expect(b.total).toBe(1850);
  });

  it('counts each recurring expense on its own schedule, not as a monthly equivalent', () => {
    const b = computeAutoBudget(2000, [
      rec({ id: 'r-1', amount: 600, cadence: 'mensuel' }), // 600
      rec({ id: 'r-2', amount: 1200, cadence: 'annuel' }), // anniversary is January: 0 in July
      rec({ id: 'r-3', amount: 30, cadence: 'hebdo', createdAt: WEEKLY_CREATED }), // 5 Thursdays: 150
    ], MONTH);
    expect(b.recurringExpenses).toBe(750);
    expect(b.total).toBe(1250);
  });

  it('charges a yearly expense nothing outside its anniversary month in computeAutoBudget', () => {
    const yearly = rec({ amount: 1200, cadence: 'annuel' });
    expect(computeAutoBudget(2000, [yearly], '2026-07').recurringExpenses).toBe(0);
    expect(computeAutoBudget(2000, [yearly], '2026-12').recurringExpenses).toBe(0);
  });

  it('charges a yearly expense its full amount in its anniversary month in computeAutoBudget', () => {
    const yearly = rec({ amount: 1200, cadence: 'annuel' });
    expect(computeAutoBudget(2000, [yearly], '2026-01').recurringExpenses).toBe(1200);
    expect(computeAutoBudget(2000, [yearly], '2027-01').recurringExpenses).toBe(1200);
  });

  it('charges a weekly expense once per occurrence inside the period in computeAutoBudget', () => {
    const weekly = rec({ amount: 10, cadence: 'hebdo', createdAt: WEEKLY_CREATED });
    const b = computeAutoBudget(100, [weekly], MONTH);
    expect(b.recurringExpenses).toBe(50);
    expect(b.total).toBe(50);
  });

  it('counts recurring income that has not been confirmed yet as expected income', () => {
    // Nothing has landed in the account, but the salary is still due.
    const b = computeAutoBudget(0, [rec({ direction: 'income', amount: 2000 })], MONTH);
    expect(b.income).toBe(2000);
    expect(b.total).toBe(2000);
  });

  it('does not count confirmed recurring income twice', () => {
    // Confirming materialises a transaction, so it is already in `actualIncome`.
    const confirmed = rec({
      direction: 'income',
      amount: 2000,
      history: [{ month: MONTH, amount: 2000, transactionId: 'tx-1' }],
    });
    const b = computeAutoBudget(2000, [confirmed], MONTH);
    expect(b.income).toBe(2000);
  });

  it('ignores a confirmation from another month', () => {
    const lastMonth = rec({
      direction: 'income',
      amount: 2000,
      history: [{ month: '2026-06', amount: 2000, transactionId: 'tx-0' }],
    });
    const b = computeAutoBudget(0, [lastMonth], MONTH);
    expect(b.income).toBe(2000);
  });

  it('counts a recurring expense whether or not it has been confirmed', () => {
    // Either way the money is committed for this month; actual expenses are
    // never summed here, so there is nothing to double count.
    const confirmed = rec({
      amount: 600,
      history: [{ month: MONTH, amount: 600, transactionId: 'tx-2' }],
    });
    expect(computeAutoBudget(2000, [confirmed], MONTH).recurringExpenses).toBe(600);
    expect(computeAutoBudget(2000, [rec({ amount: 600 })], MONTH).recurringExpenses).toBe(600);
  });

  it('never goes negative, and says so when commitments outrun income', () => {
    const b = computeAutoBudget(500, [rec({ amount: 800 })], MONTH);
    expect(b.total).toBe(0);
    expect(b.overcommitted).toBe(true);
    // The raw figures stay available so the screen can explain the shortfall.
    expect(b.income).toBe(500);
    expect(b.recurringExpenses).toBe(800);
  });

  it('is not overcommitted when income exactly covers the commitments', () => {
    const b = computeAutoBudget(600, [rec({ amount: 600 })], MONTH);
    expect(b.total).toBe(0);
    expect(b.overcommitted).toBe(false);
  });

  it('rounds the total to cents', () => {
    const b = computeAutoBudget(1, [rec({ id: 'a', amount: 0.1 }), rec({ id: 'b', amount: 0.2 })], MONTH);
    expect(b.recurringExpenses).toBe(0.3);
    expect(b.total).toBe(0.7);
  });

  // Paid on the 26th, the salary that lands in August funds September. The
  // period it was settled in is the one that must read as settled — by the
  // calendar it landed in August, and September would ask for it a second time.
  describe('with a payday anchor', () => {
    const salary = (over: Partial<Recurring> = {}): Recurring =>
      rec({ direction: 'income', amount: 2000, dueDay: 26, ...over });

    it('does not count income settled on payday again in the month it funds', () => {
      const settled = salary({
        history: [{ month: '2026-08', amount: 2000, transactionId: 'tx-1', occurrence: '2026-08-26' }],
      });
      const b = computeAutoBudget(2000, [settled], '2026-08-26', ['2026-08-26']);
      expect(b.income).toBe(2000);
      expect(b.total).toBe(2000);
    });

    it('still expects income that has not landed yet', () => {
      const b = computeAutoBudget(0, [salary()], '2026-08-26', ['2026-08-26']);
      expect(b.income).toBe(2000);
    });

    it('does not treat last payday as this one', () => {
      const settled = salary({
        history: [{ month: '2026-07', amount: 2000, transactionId: 'tx-0', occurrence: '2026-07-26' }],
      });
      expect(computeAutoBudget(0, [settled], '2026-08-26', ['2026-07-26', '2026-08-26']).income).toBe(2000);
    });

    it('reads as the calendar month when payday is the 1st', () => {
      const settled = rec({
        direction: 'income',
        amount: 2000,
        history: [{ month: MONTH, amount: 2000, transactionId: 'tx-1' }],
      });
      expect(computeAutoBudget(2000, [settled], MONTH, [])).toEqual(
        computeAutoBudget(2000, [settled], MONTH),
      );
    });
  });

});

// The hero starts from the balance, so what it must subtract is the bills that
// have not been debited yet — a settled bill is already out of the balance, and
// subtracting it again would count the same rent twice.
describe('upcomingCommitments', () => {
  it('sums the unsettled expense templates at their owed amounts', () => {
    const total = upcomingCommitments(
      [
        rec({ id: 'a', amount: 600 }),
        rec({ id: 'b', amount: 1200, cadence: 'annuel' }), // not its month
        rec({ id: 'c', amount: 30, cadence: 'hebdo', createdAt: WEEKLY_CREATED }), // 5 x 30
      ],
      MONTH,
    );
    expect(total).toBe(750);
  });

  it('owes a yearly bill nothing outside its anniversary month', () => {
    const yearly = rec({ amount: 1200, cadence: 'annuel' });
    expect(upcomingCommitments([yearly], '2026-07')).toBe(0);
    expect(upcomingCommitments([yearly], '2026-12')).toBe(0);
  });

  it('owes a yearly bill its full amount in its anniversary month and drops it once settled', () => {
    const yearly = rec({ amount: 1200, cadence: 'annuel' });
    expect(upcomingCommitments([yearly], '2026-01')).toBe(1200);
    const paid = rec({
      amount: 1200,
      cadence: 'annuel',
      history: [{ month: '2026-01', amount: 1200, transactionId: 'tx-1' }],
    });
    expect(upcomingCommitments([paid], '2026-01')).toBe(0);
  });

  it('owes each unsettled weekly occurrence in the period at full amount', () => {
    const weekly = rec({ amount: 30, cadence: 'hebdo', createdAt: WEEKLY_CREATED });
    expect(upcomingCommitments([weekly], MONTH)).toBe(150);
    const onePaid = rec({
      amount: 30,
      cadence: 'hebdo',
      createdAt: WEEKLY_CREATED,
      history: [{ month: MONTH, amount: 30, transactionId: 'tx-1', occurrence: '2026-07-09' }],
    });
    expect(upcomingCommitments([onePaid], MONTH)).toBe(120);
  });

  it('owes a passed pay cycle’s unfilled monthly bill at its full amount', () => {
    const salaries = ['2026-06-26', '2026-07-26'];
    const paidLatest = rec({
      amount: 600,
      dueDay: 26,
      history: [{ month: '2026-07', amount: 600, transactionId: 'tx-1', occurrence: '2026-07-26' }],
    });
    expect(upcomingCommitments([paidLatest], '2026-06-26', salaries)).toBe(600);
    expect(upcomingCommitments([paidLatest], '2026-07-26', salaries)).toBe(0);
  });

  it('drops a bill already settled this calendar month', () => {
    const paid = rec({
      amount: 600,
      history: [{ month: MONTH, amount: 600, transactionId: 'tx-1' }],
    });
    expect(upcomingCommitments([paid, rec({ id: 'b', amount: 100 })], MONTH)).toBe(100);
  });

  it('drops a bill settled inside the payday cycle, wherever the calendar puts it', () => {
    // Paid 28 August; with a Salaire on 26 August that settles the cycle it opens.
    const paid = rec({
      amount: 30,
      dueDay: 28,
      history: [{ month: '2026-08', amount: 30, transactionId: 'tx-1', occurrence: '2026-08-28' }],
    });
    expect(upcomingCommitments([paid], '2026-08-26', ['2026-08-26'])).toBe(0);
    // Same payment against the calendar-September question: not settled.
    expect(upcomingCommitments([paid], '2026-09', [])).toBe(30);
  });

  it('ignores income templates — expected money is not a bill', () => {
    expect(upcomingCommitments([rec({ direction: 'income', amount: 2000 })], MONTH)).toBe(0);
  });
});
