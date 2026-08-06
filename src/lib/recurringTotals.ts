// What an account's recurring templates come to, and what it is short of.
//
// Both figures are smoothed: a yearly bill counts as a twelfth and a weekly one
// as 52/12, the same normalisation the Budget screen applies. That makes
// accounts comparable and keeps the heading total and the top-up figure telling
// the same story — at the cost of understating the month a big yearly bill
// actually lands, which is a deliberate trade, not an oversight.
import { round2 } from '@/lib/calc';
import { monthlyEquivalent } from '@/lib/budget';
import type { Recurring } from '@/types/models';

/**
 * What one template is worth per month to one account.
 *
 * A charge naming a receiver is a single commitment with two sides: it leaves
 * the account that pays it and arrives in the one that receives it. Which side
 * `accountId` sits on decides the sign — and with no account named, the
 * template speaks only for itself, by its own direction.
 */
function signedMonthly(r: Recurring, accountId?: string): number {
  const monthly = monthlyEquivalent(r.amount, r.cadence);
  const receiving = accountId !== undefined && r.receiverAccountId === accountId;
  if (receiving) return monthly;
  return r.direction === 'income' ? monthly : -monthly;
}

/**
 * The net monthly position of a set of templates: recurring income less
 * recurring expenses. Negative means the account bleeds that much a month.
 *
 * Pass `accountId` to read the set from that account's point of view, so a
 * charge paid into it counts as money arriving rather than money owed.
 */
export function monthlyNet(items: Recurring[], accountId?: string): number {
  return round2(items.reduce((sum, r) => sum + signedMonthly(r, accountId), 0));
}

/**
 * What the account must receive to cover its recurring commitments, given what
 * it already holds. Zero when the balance already covers them — including when
 * the templates net out positive, where there is nothing to fund.
 *
 * A negative balance increases the figure: an account 100 in the red owing 500
 * needs 600, not 400.
 */
export function topUpNeeded(items: Recurring[], balance: number, accountId?: string): number {
  const commitment = -monthlyNet(items, accountId);
  if (commitment <= 0) return 0;
  return Math.max(0, round2(commitment - balance));
}
