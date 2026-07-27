import { describe, it, expect } from 'vitest';
import { monthlyEquivalent, computeAutoBudget, variableExpenses } from '@/lib/budget';
import type { Recurring, Transaction } from '@/types/models';

const MONTH = '2026-07';

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

  it('normalises each recurring expense to a month before summing', () => {
    const b = computeAutoBudget(2000, [
      rec({ id: 'r-1', amount: 600, cadence: 'mensuel' }),
      rec({ id: 'r-2', amount: 1200, cadence: 'annuel' }), // 100
      rec({ id: 'r-3', amount: 30, cadence: 'hebdo' }), // 130
    ], MONTH);
    expect(b.recurringExpenses).toBe(830);
    expect(b.total).toBe(1170);
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
    const b = computeAutoBudget(100, [rec({ amount: 10, cadence: 'hebdo' })], MONTH);
    expect(b.total).toBe(56.67);
  });
});
