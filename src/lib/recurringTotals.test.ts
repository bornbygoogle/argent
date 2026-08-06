import { describe, it, expect } from 'vitest';
import { monthlyNet, topUpNeeded } from '@/lib/recurringTotals';
import type { Recurring } from '@/types/models';

const rec = (over: Partial<Recurring> = {}): Recurring => ({
  id: 'r-1',
  accountId: 'acc-1',
  direction: 'expense',
  label: 'Loyer',
  amount: 750,
  cadence: 'mensuel',
  icon: 'Home',
  color: '#000',
  createdAt: '2026-01-01T00:00:00.000Z',
  history: [],
  ...over,
});

describe('monthlyNet', () => {
  it('is zero for no templates', () => {
    expect(monthlyNet([])).toBe(0);
  });

  it('nets recurring income against recurring expenses', () => {
    expect(
      monthlyNet([rec({ amount: 750 }), rec({ id: 'r-2', amount: 2000, direction: 'income' })]),
    ).toBe(1250);
  });

  it('smooths a weekly line to 52/12 of itself, not four weeks', () => {
    expect(monthlyNet([rec({ amount: 100, cadence: 'hebdo' })])).toBe(-433.33);
  });

  it('smooths a yearly line to a twelfth', () => {
    expect(monthlyNet([rec({ amount: 1200, cadence: 'annuel' })])).toBe(-100);
  });
});

describe('topUpNeeded', () => {
  it('is the commitment less what the account already holds', () => {
    const items = [rec({ amount: 750 }), rec({ id: 'r-2', amount: 42 }), rec({ id: 'r-3', amount: 120 })];
    expect(topUpNeeded(items, 200)).toBe(712);
  });

  it('is zero once the balance covers the commitment', () => {
    expect(topUpNeeded([rec({ amount: 750 })], 900)).toBe(0);
  });

  it('is zero when the templates net out positive — there is nothing to fund', () => {
    expect(topUpNeeded([rec({ amount: 2000, direction: 'income' })], 0)).toBe(0);
  });

  it('adds an overdraft to the figure rather than netting it off', () => {
    // 100 in the red owing 500 needs 600 to come out square.
    expect(topUpNeeded([rec({ amount: 500 })], -100)).toBe(600);
  });

  it('is zero for an account with no templates at all', () => {
    expect(topUpNeeded([], 50)).toBe(0);
  });

  it('counts a yearly bill at its smoothed twelfth, matching the heading', () => {
    expect(topUpNeeded([rec({ amount: 1200, cadence: 'annuel' })], 0)).toBe(100);
  });
});

// A charge naming a receiver is one commitment seen from two sides: money
// leaving the account that pays it, and the same money arriving in the one that
// receives it. Which side an account is on decides the sign.
describe('seen from one account', () => {
  const outgoing = rec({ amount: 200, receiverAccountId: 'acc-savings' });

  it('reads as a charge against the account that pays it', () => {
    expect(monthlyNet([outgoing], 'acc-1')).toBe(-200);
  });

  it('reads as money arriving for the account that receives it', () => {
    expect(monthlyNet([outgoing], 'acc-savings')).toBe(200);
  });

  it('smooths the arriving side the same way as the paying side', () => {
    const yearly = rec({ amount: 1200, cadence: 'annuel', receiverAccountId: 'acc-savings' });
    expect(monthlyNet([yearly], 'acc-savings')).toBe(100);
    expect(monthlyNet([yearly], 'acc-1')).toBe(-100);
  });

  it('is unchanged for a template with no receiver at all', () => {
    expect(monthlyNet([rec({ amount: 750 })], 'acc-1')).toBe(-750);
  });

  it('falls back to the template’s own direction when no account is named', () => {
    expect(monthlyNet([outgoing])).toBe(-200);
  });

  it('nets an account that both pays one charge and receives another', () => {
    const items = [
      rec({ id: 'r-out', accountId: 'acc-1', amount: 50 }),
      rec({ id: 'r-in', accountId: 'acc-other', amount: 200, receiverAccountId: 'acc-1' }),
    ];
    expect(monthlyNet(items, 'acc-1')).toBe(150);
  });

  it('leaves the receiver nothing to top up — the money is on its way in', () => {
    expect(topUpNeeded([outgoing], 0, 'acc-savings')).toBe(0);
  });

  it('reduces what the receiver must find by what it is due to be sent', () => {
    const items = [
      rec({ id: 'r-bill', accountId: 'acc-savings', amount: 300 }),
      rec({ id: 'r-in', accountId: 'acc-1', amount: 200, receiverAccountId: 'acc-savings' }),
    ];
    expect(topUpNeeded(items, 0, 'acc-savings')).toBe(100);
  });

  it('still asks the payer for the full commitment', () => {
    expect(topUpNeeded([outgoing], 0, 'acc-1')).toBe(200);
  });
});
