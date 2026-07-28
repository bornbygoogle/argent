# Optional due day on recurrings

**Date:** 2026-07-28
**Status:** approved, not yet implemented

## Problem

A recurring template carries no notion of *when* in the month it falls due. It
becomes "to confirm" at 00:00 on the 1st and stays there all month, so a rent
due on the 5th and a gym fee due on the 25th are indistinguishable on the 2nd.

The reactivation itself is sound and was verified on 2026-07-28: confirmation is
recorded as a `'YYYY-MM'` key in `Recurring.history`, and `isConfirmedIn`
(`src/lib/recurring.ts:77`) stops matching the moment `currentMonth()`
(`src/lib/date.ts:36`) returns a new key. Nothing schedules it; it is derived at
render.

## Decision

Add an **optional day of the month**. It gates *when an unconfirmed recurring
surfaces as due* — it does not change the reactivation cycle.

Explicitly out of scope: weekly (`hebdo`) and yearly (`annuel`) recurrings keep
reactivating on the monthly key, which understates a weekly commitment and
over-asks a yearly one. That mismatch predates this work and is left for a
separate piece of work.

## Data model

```ts
export interface Recurring {
  // …unchanged
  /** Day of the month this falls due, 1–31. Absent = due from the 1st. */
  dueDay?: number;
}
```

The field is optional, so existing rows need no backfill and behave exactly as
they do today.

**No Dexie version bump.** `dueDay` is not indexed and the `recurrings` store
declaration (`src/db/db.ts`) does not change.

**Backup and sync are already compatible**, verified by reading the code:

- `isRestorableRow` (`src/lib/data.ts:95`) validates only key fields, not the
  full row shape. A backup written by the new code restores into the old, and a
  backup written by the old code restores into the new with no `dueDay`.
- `stableStringify` (`src/lib/syncFingerprint.ts:33`) filters `undefined` values,
  so a recurring with no `dueDay` keeps the fingerprint it has today and does not
  trigger a spurious backup on upgrade.

## New module — `src/lib/recurringSchedule.ts`

Pure date arithmetic over a recurring, no database access. It exists so the four
consumers do not each re-derive the same rule.

```ts
/** The dueDay, clamped to the month's length: 31 in Feb 2026 → 28. */
clampedDay(dueDay: number, month: string): number

/** 'YYYY-MM-DD' the recurring falls due in `month`. No dueDay → the 1st. */
dueDateFor(r: Pick<Recurring, 'dueDay'>, month: string): string

/** Has the due date arrived? Plain ISO string comparison, which is
 *  automatically correct for past and future months. */
isDueYet(r: Pick<Recurring, 'dueDay'>, month: string, today?: string): boolean

/** Partition an unconfirmed list. */
splitByDue(list: Recurring[], month: string, today?: string):
  { due: Recurring[]; upcoming: Recurring[] }
```

Placement: beside `date.ts` (pure arithmetic) rather than inside `recurring.ts`,
which owns database writes.

## Behaviour

- **Reactivation is unchanged.** Still 00:00 local on the 1st, still one
  confirmation per `'YYYY-MM'` key, still derived at render with no scheduler.
- **The day gates display only.** An unconfirmed recurring whose due date has not
  arrived is shown as *Upcoming* instead of *To confirm*.
- **Early confirmation is allowed.** Paying a bill ahead of its date is normal;
  the button stays live in the Upcoming group.
- **`confirmRecurring` dates the transaction on the due day**
  (`dueDateFor(recurring, month)`) instead of `todayISO()`. This is the only
  change to the write path. A bill logged three days late lands on the day the
  money actually moved, so month totals and the daily-average denominator do not
  drift with how promptly the user tapped.
- **`unconfirmRecurring` is unchanged** — it deletes by stored `transactionId`
  and never re-derives a date.
- **`src/lib/budget.ts` is untouched.** A commitment is a commitment whether it
  falls on the 5th or the 25th, and recurring income still counts toward
  `stillDue` for the whole month regardless of its day. Gating is presentation.

### Clamping

A `dueDay` of 29, 30 or 31 clamps to the last day of a short month: 31 → 28 Feb
2026, → 29 Feb 2028. The stored value is never rewritten; clamping happens at
read time, so a February clamp does not damage the March date.

## UI

| File | Change |
|---|---|
| `src/features/recurring/RecurringFormSheet.tsx` | New "Due day" row: numeric input, accepts 1–31, blank allowed and blank means no day. Shown for every cadence — it is the day the item surfaces, whatever the cadence. Editing to blank clears the field. |
| `src/features/recurring/Recurring.tsx` | The `todo` mode renders two groups: **To confirm** (due) and **Upcoming** (not yet due). Each row shows its due date. Both groups keep a working Log button. Rows sort by clamped due day. The header summary counts and totals the due group only. |
| `src/features/dashboard/Dashboard.tsx:52` | The top-4 to-do list is drawn from due items only. |
| `src/features/settings/Settings.tsx:105` | `todoCount` counts due items only, so the badge means "due now". |
| `src/locales/{en,fr}/common.json` | New keys under `recurring`: `dueDayLabel`, `dueDayHint`, `dueDayNone`, `upcoming`, `dueOn`. |

Input validation: the form accepts digits only and rejects anything outside
1–31 rather than silently coercing it — a typed `45` is not saved as `31`. An
empty field saves no day. Save stays enabled either way, since the field is
optional.

## Write API

`RecurringInput.dueDay?: number` — optional at creation, absent means no day.

`RecurringPatch.dueDay?: number | null` — `undefined` keeps the existing
`"absent means do not touch"` contract that every other field in the patch
already follows, and `null` explicitly clears the day. `updateRecurring` must
translate `null` into removing the property, not into storing a literal `null`,
so that a cleared recurring is byte-identical to one that never had a day.

## Testing

TDD, RED first, per the project discipline.

**`src/lib/recurringSchedule.test.ts`** (new, pure — no IndexedDB needed):

- `clampedDay`: 15 → 15; 31 in Feb 2026 → 28; 31 in Feb 2028 → 29; 31 in Apr → 30.
- `dueDateFor`: absent `dueDay` → the 1st; clamped month; a normal month.
- `isDueYet`: the day before the due date → false; the due date itself → true;
  the day after → true; a past month → true; a future month → false.
- `splitByDue`: partitions correctly and preserves input order within a group.

**`src/lib/recurring.test.ts`** (new — the module has no test file today):

- Reactivation boundary: confirmed on the 15th stays confirmed at
  `23:59:59` on the last day of the month, and is due again at `00:00` on the
  1st. (Promoted from the throwaway probe used to verify current behaviour;
  the probe file is deleted.)
- Re-confirming the same month is idempotent — same transaction id, one row.
- `confirmRecurring` dates the transaction on the due day when confirmed **late**.
- `confirmRecurring` dates the transaction on the due day when confirmed
  **early** (a future-dated transaction, deliberately).
- A clamped month dates the transaction on the last day.
- Absent `dueDay` dates the transaction on the 1st.
- `unconfirmRecurring` still deletes the linked transaction.

Tests that touch Dexie must fake **only** `Date` — `vi.useFakeTimers({ toFake:
['Date'] })`. Faking the timer queue wholesale deadlocks Dexie; this was
observed on 2026-07-28 (three tests timed out) and again in the earlier
GoogleAutoBackup work.

## Verification

1. Full suite green and `tsc` clean — nothing weakened to get there.
2. Run the app and look at the Recurring screen with a mix of past-due and
   future-due items. The grouping claim is a UI claim and is not verified by a
   passing unit test.

## Accepted consequences

1. **Confirming early writes a future-dated transaction.** Rent due the 20th,
   logged the 3rd, is dated the 20th. This is right for month totals but means
   the account balance and MonthlyOverview include money that has not left the
   account yet.
2. **Weekly and yearly cadences still reactivate monthly.** A `dueDay` on a
   weekly item reads oddly, since the item can still only be confirmed once a
   month. Out of scope, stated above.
