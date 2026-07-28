# Recurring Due Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a recurring template an optional day of the month, so an unconfirmed recurring surfaces as "to confirm" only once that day arrives, and its transaction is dated on that day.

**Architecture:** One optional field `dueDay?: number` on `Recurring`, plus a new pure module `src/lib/recurringSchedule.ts` holding every date rule (clamping, due date, is-it-due-yet, partitioning). The write path changes in exactly one place — `confirmRecurring` dates its transaction on the due day instead of today. Four UI call sites consume the partition. Reactivation itself is untouched: still one confirmation per `'YYYY-MM'` key, still 00:00 on the 1st.

**Tech Stack:** React 19, TypeScript, Dexie 4 (IndexedDB), Vitest 2 + happy-dom + fake-indexeddb, react-i18next.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-28-recurring-due-day-design.md`. Read it before Task 1.
- **No Dexie version bump.** `dueDay` is not indexed; `src/db/db.ts` must not change.
- **`src/lib/budget.ts` must not change.** Gating is presentation only; a commitment counts for the whole month whatever its day.
- **Tests that touch Dexie must fake only `Date`:** `vi.useFakeTimers({ toFake: ['Date'] })`. Faking the whole timer queue deadlocks Dexie — three tests timed out this way on 2026-07-28.
- Absent `dueDay` must behave exactly as the code does today: due from the 1st.
- Run commands from the repo root: `/mnt/data2/DiskG/MEGA/Code/gestionmoney`.
- Test command: `npx vitest run <path>`. Full suite: `npx vitest run`.
- **Types: `npm run typecheck` (`tsc -b --noEmit`) — never bare `npx tsc --noEmit`.**
  The root `tsconfig.json` carries `"files": []` and only project references, so
  a bare `tsc --noEmit` checks nothing and exits 0. It reported clean while two
  real type errors sat in the tree on 2026-07-28. `npm run build` is the
  strongest gate and should run before the final commit.
- Every user-visible string goes through `t()` with a key added to **both** `src/locales/en/common.json` and `src/locales/fr/common.json`.
- Never weaken or delete an existing test to make something pass.

---

### Task 1: The schedule module

**Files:**
- Create: `src/lib/recurringSchedule.ts`
- Test: `src/lib/recurringSchedule.test.ts`
- Modify: `src/types/models.ts` (add `dueDay` to the `Recurring` interface)

**Interfaces:**
- Consumes: `daysInMonth`, `todayISO` from `src/lib/date.ts`; the `Recurring` type.
- Produces:
  - `clampedDay(dueDay: number, month: string): number`
  - `dueDateFor(r: DueDayed, month: string): string` — returns `'YYYY-MM-DD'`
  - `isDueYet(r: DueDayed, month: string, today?: string): boolean`
  - `splitByDue<T extends DueDayed>(list: T[], month: string, today?: string): { due: T[]; upcoming: T[] }`
  - `type DueDayed = Pick<Recurring, 'dueDay'>`

- [ ] **Step 1: Add the field to the model**

In `src/types/models.ts`, inside `export interface Recurring`, after the `cadenceMeta?: string;` line:

```ts
  /** Day of the month this falls due, 1–31. Absent = due from the 1st. */
  dueDay?: number;
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/recurringSchedule.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  clampedDay,
  dueDateFor,
  isDueYet,
  splitByDue,
} from '@/lib/recurringSchedule';

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

describe('isDueYet', () => {
  it('is false the day before', () => {
    expect(isDueYet({ dueDay: 5 }, '2026-08', '2026-08-04')).toBe(false);
  });

  it('is true on the day itself', () => {
    expect(isDueYet({ dueDay: 5 }, '2026-08', '2026-08-05')).toBe(true);
  });

  it('is true after the day', () => {
    expect(isDueYet({ dueDay: 5 }, '2026-08', '2026-08-09')).toBe(true);
  });

  it('is true for a month already past', () => {
    expect(isDueYet({ dueDay: 25 }, '2026-07', '2026-08-01')).toBe(true);
  });

  it('is false for a month still ahead', () => {
    expect(isDueYet({ dueDay: 1 }, '2026-09', '2026-08-31')).toBe(false);
  });

  it('is always true from the 1st when no day is set', () => {
    expect(isDueYet({}, '2026-08', '2026-08-01')).toBe(true);
  });
});

describe('splitByDue', () => {
  it('partitions and keeps input order inside each group', () => {
    const list = [
      { id: 'a', dueDay: 2 },
      { id: 'b', dueDay: 20 },
      { id: 'c', dueDay: 5 },
      { id: 'd', dueDay: 25 },
    ];
    const { due, upcoming } = splitByDue(list, '2026-08', '2026-08-06');
    expect(due.map((r) => r.id)).toEqual(['a', 'c']);
    expect(upcoming.map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('puts day-less entries in the due group', () => {
    const { due, upcoming } = splitByDue([{ id: 'a' }], '2026-08', '2026-08-01');
    expect(due).toHaveLength(1);
    expect(upcoming).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the test and watch it fail for the right reason**

Run: `npx vitest run src/lib/recurringSchedule.test.ts`
Expected: FAIL — cannot resolve `@/lib/recurringSchedule`. Not an assertion failure.

- [ ] **Step 4: Write the module**

Create `src/lib/recurringSchedule.ts`:

```ts
// When a recurring falls due inside a month.
//
// Reactivation stays keyed to the calendar month — this module only answers
// "has its day arrived yet", so a bill due on the 25th does not sit in the
// to-do list from the 1st. The day is clamped at read time, never rewritten:
// a 31 stored against a February must still mean the 31st in March.
import { daysInMonth, todayISO } from '@/lib/date';
import type { Recurring } from '@/types/models';

/** Anything carrying an optional due day — the whole record is never needed. */
export type DueDayed = Pick<Recurring, 'dueDay'>;

/** The day, held inside the month's real length. */
export function clampedDay(dueDay: number, month: string): number {
  return Math.min(Math.max(Math.trunc(dueDay), 1), daysInMonth(month));
}

/** 'YYYY-MM-DD' the recurring falls due in `month`. No day set = the 1st. */
export function dueDateFor(r: DueDayed, month: string): string {
  const day = r.dueDay == null ? 1 : clampedDay(r.dueDay, month);
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** Has the due date arrived? ISO strings compare correctly across months,
 *  so a past month reads as due and a future one does not. */
export function isDueYet(r: DueDayed, month: string, today: string = todayISO()): boolean {
  return dueDateFor(r, month) <= today;
}

/** Split the unconfirmed into what is due now and what is still ahead. */
export function splitByDue<T extends DueDayed>(
  list: T[],
  month: string,
  today: string = todayISO(),
): { due: T[]; upcoming: T[] } {
  const due: T[] = [];
  const upcoming: T[] = [];
  for (const r of list) (isDueYet(r, month, today) ? due : upcoming).push(r);
  return { due, upcoming };
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run src/lib/recurringSchedule.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/recurringSchedule.ts src/lib/recurringSchedule.test.ts src/types/models.ts
git commit -m "feat(recurring): add optional dueDay and the schedule rules"
```

---

### Task 2: Write path — create, patch, and date the transaction

**Files:**
- Modify: `src/lib/recurring.ts`
- Create: `src/lib/recurring.test.ts`
- Delete: `src/lib/__reactivation.probe.test.ts`

**Interfaces:**
- Consumes: `dueDateFor` from Task 1.
- Produces:
  - `RecurringInput.dueDay?: number`
  - `RecurringPatch.dueDay?: number | null` — `null` clears the day
  - `confirmRecurring` now dates its transaction `dueDateFor(recurring, month)`

- [ ] **Step 1: Write the failing test**

Create `src/lib/recurring.test.ts`. The reactivation-boundary and idempotence cases are promoted from the throwaway probe used to verify current behaviour on 2026-07-28.

```ts
// happy-dom ships no IndexedDB, so Dexie needs a shim. This import must come
// before '@/db/db' — that module constructs the Dexie instance at load time.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db/db';
import {
  createRecurring,
  updateRecurring,
  confirmRecurring,
  unconfirmRecurring,
  isConfirmedIn,
} from '@/lib/recurring';
import type { Recurring, RecurringInput } from '@/lib/recurring';
import { currentMonth } from '@/lib/date';

const base: RecurringInput = {
  accountId: 'acc-1',
  direction: 'expense',
  label: 'Rent',
  amount: 600,
  cadence: 'mensuel',
  icon: 'Home',
  color: '#000000',
};

const load = async (id: string): Promise<Recurring> => {
  const r = await db.recurrings.get(id);
  if (!r) throw new Error(`recurring ${id} vanished`);
  return r;
};

/** Only Date is faked — faking the timer queue deadlocks Dexie. */
const freeze = (y: number, monthIndex: number, day: number, hour = 12) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(y, monthIndex, day, hour, 0, 0));
};

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reactivation boundary', () => {
  it('holds until the last instant of the month, then falls due again', async () => {
    freeze(2026, 6, 15);
    const id = await createRecurring(base);
    await confirmRecurring(await load(id));
    expect(isConfirmedIn(await load(id))).toBe(true);
    expect(currentMonth()).toBe('2026-07');

    vi.setSystemTime(new Date(2026, 6, 31, 23, 59, 59));
    expect(isConfirmedIn(await load(id))).toBe(true);

    // First instant of August — reactivated with no code running in between.
    vi.setSystemTime(new Date(2026, 7, 1, 0, 0, 0));
    expect(currentMonth()).toBe('2026-08');
    expect(isConfirmedIn(await load(id))).toBe(false);
  });

  it('re-confirming the same month creates nothing new', async () => {
    freeze(2026, 6, 15);
    const id = await createRecurring(base);
    const first = await confirmRecurring(await load(id));
    const second = await confirmRecurring(await load(id));
    expect(second).toBe(first);
    expect(await db.transactions.count()).toBe(1);
  });
});

describe('confirmRecurring transaction date', () => {
  it('uses the due day when confirmed late', async () => {
    freeze(2026, 7, 9); // 9 Aug, three days late
    const id = await createRecurring({ ...base, dueDay: 5 });
    const txId = await confirmRecurring(await load(id));
    expect((await db.transactions.get(txId!))?.date).toBe('2026-08-05');
  });

  it('uses the due day when confirmed early, future-dating it', async () => {
    freeze(2026, 7, 3); // 3 Aug, ahead of a 20th due day
    const id = await createRecurring({ ...base, dueDay: 20 });
    const txId = await confirmRecurring(await load(id));
    expect((await db.transactions.get(txId!))?.date).toBe('2026-08-20');
  });

  it('clamps a 31 into a short month', async () => {
    freeze(2026, 1, 20); // 20 Feb 2026
    const id = await createRecurring({ ...base, dueDay: 31 });
    const txId = await confirmRecurring(await load(id));
    expect((await db.transactions.get(txId!))?.date).toBe('2026-02-28');
  });

  it('falls back to the 1st when no day is set', async () => {
    freeze(2026, 7, 9);
    const id = await createRecurring(base);
    const txId = await confirmRecurring(await load(id));
    expect((await db.transactions.get(txId!))?.date).toBe('2026-08-01');
  });

  it('links the transaction back to its template', async () => {
    freeze(2026, 7, 9);
    const id = await createRecurring({ ...base, dueDay: 5 });
    const txId = await confirmRecurring(await load(id));
    expect((await db.transactions.get(txId!))?.recurringSourceId).toBe(id);
  });
});

describe('unconfirmRecurring', () => {
  it('deletes the linked transaction and drops the entry', async () => {
    freeze(2026, 7, 9);
    const id = await createRecurring({ ...base, dueDay: 5 });
    await confirmRecurring(await load(id));
    await unconfirmRecurring(await load(id));
    expect(await db.transactions.count()).toBe(0);
    expect((await load(id)).history).toHaveLength(0);
  });
});

describe('dueDay writes', () => {
  it('stores the day given at creation', async () => {
    freeze(2026, 7, 1);
    const id = await createRecurring({ ...base, dueDay: 12 });
    expect((await load(id)).dueDay).toBe(12);
  });

  it('leaves the day alone when the patch omits it', async () => {
    freeze(2026, 7, 1);
    const id = await createRecurring({ ...base, dueDay: 12 });
    await updateRecurring(id, { amount: 700 });
    const r = await load(id);
    expect(r.amount).toBe(700);
    expect(r.dueDay).toBe(12);
  });

  it('removes the property outright when the patch clears it', async () => {
    freeze(2026, 7, 1);
    const id = await createRecurring({ ...base, dueDay: 12 });
    await updateRecurring(id, { dueDay: null });
    const r = await load(id);
    // Not merely undefined: a cleared recurring must be indistinguishable from
    // one that never had a day, or the sync fingerprint sees a phantom change.
    expect('dueDay' in r).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail for the right reason**

Run: `npx vitest run src/lib/recurring.test.ts`
Expected: FAIL. The reactivation and unconfirm cases pass (that behaviour exists); the date cases fail on `'2026-08-09'` vs `'2026-08-05'`, and the `dueDay` cases fail because the field is not written. `RecurringInput`/`Recurring` type imports may also error — `Recurring` is a type re-export, see Step 3.

- [ ] **Step 3: Wire `dueDay` through the write path**

In `src/lib/recurring.ts`:

Add the import beside the existing ones:

```ts
import { dueDateFor } from '@/lib/recurringSchedule';
```

Re-export the row type so the test can name it (add under the existing `import type` block):

```ts
export type { Recurring } from '@/types/models';
```

Add to `RecurringInput`, after `incomeType?: string;`:

```ts
  /** Day of the month it falls due, 1–31. Omit for "due from the 1st". */
  dueDay?: number;
```

In `createRecurring`, inside the object literal, after the `incomeType:` line:

```ts
    dueDay: input.dueDay,
```

Add to `RecurringPatch`, after `incomeType?: string;`:

```ts
  /** `null` clears the day; omitting the key leaves it untouched. */
  dueDay?: number | null;
```

In `updateRecurring`, the patch loop currently builds a `Partial<Recurring>`. Replace the whole function so a `null` deletes the key rather than storing it:

```ts
/** Edit a template. Amount changes are forward-only (history keeps old values). */
export async function updateRecurring(id: string, patch: RecurringPatch): Promise<void> {
  const next: Record<string, unknown> = {};
  if (patch.label !== undefined) next.label = patch.label.trim() || 'Recurring';
  if (patch.amount !== undefined) next.amount = round2(patch.amount);
  if (patch.cadence !== undefined) next.cadence = patch.cadence;
  if (patch.icon !== undefined) next.icon = patch.icon;
  if (patch.color !== undefined) next.color = patch.color;
  if (patch.categoryId !== undefined) next.categoryId = patch.categoryId;
  if (patch.incomeType !== undefined) next.incomeType = patch.incomeType;
  // Dexie deletes a property when its update value is `undefined`, which is
  // what clearing has to do: a `null` left in the row would read as a change
  // to the sync fingerprint and differ from a recurring that never had a day.
  if (patch.dueDay !== undefined) next.dueDay = patch.dueDay ?? undefined;
  await db.recurrings.update(id, next);
}
```

In `confirmRecurring`, replace the transaction's date:

```ts
    date: dueDateFor(recurring, month),
```

and delete the now-unused `todayISO` from the `@/lib/date` import, keeping `currentMonth`.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/lib/recurring.test.ts`
Expected: PASS, 11 tests.

If the "removes the property outright" case still fails, Dexie's `update` is keeping the key. Fall back to a read-modify-write in `updateRecurring` for that one field:

```ts
  if (patch.dueDay === null) {
    const row = await db.recurrings.get(id);
    if (row) {
      delete row.dueDay;
      await db.recurrings.put({ ...row, ...(next as Partial<Recurring>) });
      return;
    }
  }
```

Do not change the test to accept `undefined`.

- [ ] **Step 5: Delete the throwaway probe**

```bash
rm src/lib/__reactivation.probe.test.ts
```

Its cases now live in `src/lib/recurring.test.ts`.

- [ ] **Step 6: Run the full suite and type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: every test file passes (`budget.test.ts` included — it must be untouched), no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/recurring.ts src/lib/recurring.test.ts
git add -u src/lib/__reactivation.probe.test.ts
git commit -m "feat(recurring): date the confirmed transaction on its due day"
```

---

### Task 3: Translations

**Files:**
- Modify: `src/locales/en/common.json`
- Modify: `src/locales/fr/common.json`

**Interfaces:**
- Produces: keys `recurring.dueDayLabel`, `recurring.dueDayHint`, `recurring.dueDayNone`, `recurring.upcoming`, `recurring.dueOn` (takes `{{date}}`), consumed by Tasks 4 and 5.

- [ ] **Step 1: Add the English keys**

In `src/locales/en/common.json`, inside the `"recurring"` object, after `"cadenceLabel": "Frequency",`:

```json
    "dueDayLabel": "Due day",
    "dueDayHint": "Day of the month it falls due. Leave empty to see it from the 1st.",
    "dueDayNone": "No day",
    "upcoming": "Upcoming",
    "dueOn": "Due {{date}}",
```

- [ ] **Step 2: Add the French keys**

In `src/locales/fr/common.json`, inside the `"recurring"` object, after `"cadenceLabel": "Fréquence",`:

```json
    "dueDayLabel": "Jour d'échéance",
    "dueDayHint": "Jour du mois où il tombe. Laissez vide pour le voir dès le 1er.",
    "dueDayNone": "Aucun jour",
    "upcoming": "À venir",
    "dueOn": "Le {{date}}",
```

- [ ] **Step 3: Check both files still parse and hold the same keys**

Run:

```bash
node -e "
const fs=require('fs');
const read=(p)=>JSON.parse(fs.readFileSync(p,'utf8')).recurring;
const a=Object.keys(read('./src/locales/en/common.json')).sort();
const b=Object.keys(read('./src/locales/fr/common.json')).sort();
console.log(JSON.stringify(a)===JSON.stringify(b) ? 'keys match: '+a.length : 'MISMATCH');
"
```

Expected: `keys match: 32` (27 today, plus the 5 added here). A `MISMATCH`, or a
parse error, means a trailing comma or a key added to only one file.

- [ ] **Step 4: Commit**

```bash
git add src/locales/en/common.json src/locales/fr/common.json
git commit -m "i18n(recurring): due-day and upcoming strings"
```

---

### Task 4: The form field

**Files:**
- Modify: `src/features/recurring/RecurringFormSheet.tsx`

**Interfaces:**
- Consumes: `RecurringInput.dueDay`, `RecurringPatch.dueDay` (Task 2); `recurring.dueDayLabel`, `recurring.dueDayHint`, `recurring.dueDayNone` (Task 3).

- [ ] **Step 1: Add the state**

Beside the other `useState` calls, after the `cadence` line:

```ts
  const [dueDayStr, setDueDayStr] = useState(existing?.dueDay ? String(existing.dueDay) : '');
```

And in the `useEffect` that resets on target change, after `setCadence(existing.cadence);`:

```ts
      setDueDayStr(existing.dueDay ? String(existing.dueDay) : '');
```

- [ ] **Step 2: Parse and validate**

Above the `save` function:

```ts
  // Digits only, and only a real day of the month. A typo like 45 is rejected
  // rather than quietly clamped to 31 — the user meant something else.
  const dueDayNum = dueDayStr === '' ? null : Number.parseInt(dueDayStr, 10);
  const dueDayValid = dueDayNum === null || (dueDayNum >= 1 && dueDayNum <= 31);
```

- [ ] **Step 3: Send it on save**

In `save`, add to the `common` object after `cadence,`:

```ts
        dueDay: dueDayNum,
```

`createRecurring` takes `number | undefined`, so change the create call to normalise the `null`:

```ts
      if (existing) await updateRecurring(existing.id, common);
      else await createRecurring({ accountId, direction, ...common, dueDay: dueDayNum ?? undefined });
```

- [ ] **Step 4: Render the field**

Directly after the cadence `Segmented` block, before the category/income combo box:

```tsx
          {/* due day */}
          <p className="label" style={{ marginTop: 16, marginBottom: 8 }}>{t('recurring.dueDayLabel')}</p>
          <div className="card tight" style={{ padding: '4px 0' }}>
            <div className="row" style={{ padding: '9px 16px' }}>
              <span style={{ fontSize: 15, color: 'var(--neutral-700)' }}>{t('recurring.dueDayLabel')}</span>
              <span style={{ flex: 1 }} />
              <input
                value={dueDayStr}
                onChange={(e) => setDueDayStr(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                inputMode="numeric"
                placeholder={t('recurring.dueDayNone')}
                aria-label={t('recurring.dueDayLabel')}
                aria-invalid={!dueDayValid}
                className="tnum"
                style={{
                  width: 110,
                  height: 32,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 16,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  color: dueDayValid ? 'var(--neutral-900)' : 'var(--danger-600)',
                  textAlign: 'right',
                }}
              />
            </div>
          </div>
          <span className="caption" style={{ display: 'block', marginTop: 6 }}>
            {t('recurring.dueDayHint')}
          </span>
```

- [ ] **Step 5: Block saving an out-of-range day**

Change the save button's `disabled` expression:

```tsx
          <Button full onClick={save} disabled={busy || !label.trim() || !amountStr || !dueDayValid} style={{ marginTop: 20 }}>
```

- [ ] **Step 6: Type-check and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/recurring/RecurringFormSheet.tsx
git commit -m "feat(recurring): due-day field on the form sheet"
```

---

### Task 5: Grouping in the UI

**Files:**
- Modify: `src/features/recurring/Recurring.tsx`
- Modify: `src/features/dashboard/Dashboard.tsx:52`
- Modify: `src/features/settings/Settings.tsx:105`

**Interfaces:**
- Consumes: `splitByDue`, `dueDateFor`, `clampedDay` (Task 1); `recurring.upcoming`, `recurring.dueOn` (Task 3); `formatDate(iso, 'weekday')` from `src/lib/format.ts`.

- [ ] **Step 1: Settings — the badge counts what is due now**

In `src/features/settings/Settings.tsx`, add to the imports:

```ts
import { isDueYet } from '@/lib/recurringSchedule';
```

Replace line 105:

```ts
  const todoCount = recurrings.filter(
    (r) => !isConfirmedIn(r, currentMonth()) && isDueYet(r, currentMonth()),
  ).length;
```

- [ ] **Step 2: Dashboard — the top-4 list shows what is due now**

In `src/features/dashboard/Dashboard.tsx`, add to the imports:

```ts
import { isDueYet } from '@/lib/recurringSchedule';
```

Replace line 52:

```ts
  const todoRecurring = recurrings
    .filter((r) => !isConfirmedIn(r, month) && isDueYet(r, month))
    .slice(0, 4);
```

- [ ] **Step 3: Recurring screen — split the to-do list**

In `src/features/recurring/Recurring.tsx`, add to the imports:

```ts
import { splitByDue, dueDateFor, clampedDay } from '@/lib/recurringSchedule';
import { formatDate } from '@/lib/format';
```

`formatDate` joins the existing `@/lib/format` import — make it
`import { formatCurrency, formatSignedCurrency, formatMonth, formatDate } from '@/lib/format';`
rather than a second import statement.

Replace the summary block (lines 50–53) with:

```ts
  // Summary — always over the full set. "To confirm" means due now; what has
  // not reached its day yet is upcoming and does not read as a task.
  const unconfirmed = recurrings.filter((r) => !isConfirmedIn(r, month));
  const { due: todo, upcoming } = splitByDue(unconfirmed, month);
  const done = recurrings.filter((r) => isConfirmedIn(r, month));
  const todoAmount = todo.reduce((acc, r) => acc + r.amount, 0);
  const doneAmount = done.reduce((acc, r) => acc + r.amount, 0);
```

- [ ] **Step 4: Sort each group by its day and render both**

Still in `Recurring.tsx`, replace the `group` helper's return so items come out in due-day order, by adding a sort inside the `.map`:

```ts
  const byDueDay = (a: RecurringT, b: RecurringT) =>
    clampedDay(a.dueDay ?? 1, month) - clampedDay(b.dueDay ?? 1, month);

  // Group a list by account, ordered like the account list.
  const group = (list: RecurringT[]) => {
    const m = new Map<string, RecurringT[]>();
    for (const r of list) {
      const arr = m.get(r.accountId) ?? [];
      arr.push(r);
      m.set(r.accountId, arr);
    }
    return [...m.entries()]
      .map(([aid, items]) => ({ account: accountMap.get(aid), items: [...items].sort(byDueDay) }))
      .filter((g): g is { account: Account; items: RecurringT[] } => !!g.account)
      .sort((a, b) => order(a.account, b.account));
  };
```

Replace the `visible`/`groups` lines with a second set for the upcoming group:

```ts
  const visible = mode === 'todo' ? todo : mode === 'all' ? recurrings : [];
  const groups = group(visible);
  const upcomingGroups = mode === 'todo' ? group(upcoming) : [];
```

- [ ] **Step 5: Show the due date on every row**

In the row's `r-sub` line inside the `groups.map` render, replace:

```tsx
                            {cadenceLabel(t, r.cadence)} · {formatCurrency(r.amount)}
```

with:

```tsx
                            {cadenceLabel(t, r.cadence)} · {formatCurrency(r.amount)}
                            {r.dueDay != null && ` · ${t('recurring.dueOn', { date: formatDate(dueDateFor(r, month), 'weekday') })}`}
```

- [ ] **Step 6: Render the Upcoming section**

Immediately after the `groups.map(...)` expression closes — that is, after the `)` that ends the `mode !== 'history'` truthy branch's list and before the `) : history.length === 0 ? (` — the branch needs both lists. Replace the whole truthy branch's body so it renders the due groups and then the upcoming ones:

```tsx
        {mode !== 'history' ? (
          groups.length === 0 && upcomingGroups.length === 0 ? (
            <EmptyState icon="Repeat" title={t('recurring.empty')} hint={t('recurring.emptyHint')} />
          ) : (
            <>
              {groups.map((g) => renderGroup(g))}
              {upcomingGroups.length > 0 && (
                <>
                  <div className="section-head" style={{ marginTop: 6 }}>
                    <span className="label">{t('recurring.upcoming')}</span>
                  </div>
                  {upcomingGroups.map((g) => renderGroup(g))}
                </>
              )}
            </>
          )
        ) : history.length === 0 ? (
```

To avoid duplicating the row markup, lift the existing `groups.map` body into a local function declared above the `return`, keeping every line of the current markup verbatim (the `TintedIcon`, `r-main`, amount span and `confirm-btn`), with the `r-sub` change from Step 5 applied:

```tsx
  const renderGroup = (g: { account: Account; items: RecurringT[] }) => (
    <div key={g.account.id}>
      <div className="section-head">
        <span className="label">{g.account.name}</span>
      </div>
      <div className="card tight">
        {g.items.map((r) => {
          const confirmed = isConfirmedIn(r, month);
          const last = [...r.history].sort((a, b) => (a.month < b.month ? 1 : -1))[0];
          const modified = last != null && Math.abs(last.amount - r.amount) > 0.005;
          return (
            <div className="recur" key={r.id}>
              <TintedIcon hex={r.color} icon={r.icon} variant="cat" />
              <div className="r-main" onClick={() => setEditing(r)} style={{ cursor: 'pointer', minWidth: 0 }}>
                <div className="r-title">{r.label}</div>
                <div className="r-sub">
                  {cadenceLabel(t, r.cadence)} · {formatCurrency(r.amount)}
                  {r.dueDay != null && ` · ${t('recurring.dueOn', { date: formatDate(dueDateFor(r, month), 'weekday') })}`}
                  {modified && (
                    <>
                      {' → '}
                      <span style={{ color: 'var(--primary-600)', fontWeight: 600 }}>{t('recurring.modified')}</span>
                    </>
                  )}
                </div>
              </div>
              <span
                className={`amount-md ${r.direction === 'income' ? 'amt-in' : 'amt-out'}`}
                style={{ color: r.direction === 'income' ? 'var(--success-600)' : undefined }}
              >
                {formatSignedCurrency(r.direction === 'income' ? r.amount : -r.amount)}
              </span>
              <button
                type="button"
                className={`confirm-btn${confirmed ? ' done' : ''}`}
                onClick={() => setPendingConfirm({ r, on: !isConfirmedIn(r, month) })}
                disabled={pending === r.id}
              >
                <Icon name="Check" size={14} strokeWidth={2.5} />
                {confirmed ? t('recurring.confirmedBtn') : t('recurring.confirmBtn')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
```

The Log button stays enabled in the upcoming group — confirming early is allowed by design.

- [ ] **Step 7: Type-check and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass, `BottomNav.test.tsx` and the other component tests included.

- [ ] **Step 8: Commit**

```bash
git add src/features/recurring/Recurring.tsx src/features/dashboard/Dashboard.tsx src/features/settings/Settings.tsx
git commit -m "feat(recurring): separate due from upcoming across the screens"
```

---

### Task 6: Verify in the running app

**Files:** none — this is the check that the unit tests cannot make.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Note the port. If 5173 is taken, use whatever Vite reports.

- [ ] **Step 2: Create three recurrings on the Recurring screen**

Via `+ New`: one with a due day already past (a low day such as 2), one with a day still ahead this month (a high day such as 28), and one with the field left blank.

- [ ] **Step 3: Check the grouping**

Expected on the **To confirm** tab: the past-due one and the blank one under their account headings; the future one under an **Upcoming** heading, showing its date, with a working Log button.

- [ ] **Step 4: Check the badge and the dashboard**

Expected: the Settings badge and the Dashboard "To confirm" list both exclude the upcoming item.

- [ ] **Step 5: Confirm the past-due one and check the transaction's date**

Log it, then open the transaction list. Expected: it is dated on the due day, not today.

- [ ] **Step 6: Report**

Write down what you actually saw for each of steps 3–5. If any differs from the expectation, stop and fix before claiming the feature works.

---

## Rollback

Every task is a single commit against `main`. To undo the feature entirely:
`git revert` the commits from Tasks 1–5 in reverse order. No schema version
changed and no data was migrated, so no data cleanup is needed — rows carrying
a `dueDay` are simply ignored by the reverted code.
