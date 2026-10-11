# Product rulings for gestionmoney (decided by the product owner)

## Recurring expenses: which instalment a payment settles
- A payment settles the instalment of the month its transaction date falls in.
  A bill due on the 25th and paid on 20 July settles July, never June.
  There is never a second charge for a month already paid.
- Existing entries stay as stored: none is deleted or rewritten to fit a new rule.

## Pay cycles (monthly recurring expenses)
- A pay cycle starts at each income of type "Salaire" and lasts until the next one.
  No other income type opens a cycle.
- Within a cycle, each MONTHLY recurring expense holds at most one entry. An entry
  belongs to the cycle its transaction date falls in, not the day it was typed in,
  so a backdated entry fills the cycle its date is in. A calendar month can
  therefore hold 0, 1 or 2 entries of the same expense.
- A passed cycle with a monthly expense still unfilled is shown as owed, and its
  "Log" action pre-fills a date inside that cycle.
- Every list, count and confirm button, and "Left to spend", follows pay cycles
  for monthly expenses: the Dashboard, the Recurring page and Settings can never
  disagree about what is owed.
- "Left to spend" subtracts an owed monthly expense at its full amount.
- Before the first "Salaire" income, or for dates before it, monthly expenses are
  payable with a fallback of one entry per calendar month.
- The due day keeps only its display roles: display order and calendar dots.

## Weekly and yearly recurring expenses
- The pay-cycle rule applies to monthly recurring expenses only. Weekly and yearly
  expenses keep their own schedule.
- A yearly expense is owed only in the calendar month of its creation anniversary
  (the rule the calendar dots use), never in every month.

## Tests
- A test that pins behaviour a task deliberately replaces may be rewritten to pin
  the new rule. Tests of behaviour the task does not change must keep passing.
