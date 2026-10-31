# Outcome — all 41 findings closed, 2026-10-31

Everything below this section is the original audit handover, kept as written.
This section records what was actually done about it.

**State of `main` at `51f6aca`:** 61 test files, 775 tests, `vitest` exit 0,
`npm run typecheck` exit 0, `npm run build` exit 0. Baseline before the work was
591 tests at `f6fb9f9`, so the suite grew by 184 tests. No agentics branches or
worktrees remain.

22 agentics runs, $38.23. Each finding was re-verified against source before its
run, which mattered: see "Where the audit was wrong" below.

## What the audit got wrong

Four corrections worth knowing, because they change how you read the rest of it.

- **F005 was filed against two files. It was eleven sites across eight.** The
  audit named `Accounts.tsx` and `Budget.tsx`; the hardcoded `€` was also in
  `Onboarding.tsx`, `MonthlyOverview.tsx`, `AccountPickerSheet.tsx`,
  `RecurringFormSheet.tsx`, `TransactionForm.tsx` and `Transfer.tsx`. A non-EUR
  user saw the wrong symbol on every amount input in the app. Filed as cosmetic;
  it was a correctness bug.
- **F032 was filed minor. The pay-cycle work made it a startup data-corruption
  bug.** `backfillOccurrences` runs on every launch and judged misattribution by
  comparing calendar months, so a bill due 30 August in a cycle opened 26 August
  but paid 2 September was rewritten into the wrong cycle, then pushed to Drive.
  Severities in the audit were assigned against the pre-migration code.
- **F018 was described as picking the wrong income type.** True but minor:
  `lastPaydayDay` already filtered on `Salaire` correctly, and only a template
  fallback missed the check. The real defect was structural — `payAnchorDay`
  returned a single day-of-month, which cannot express "from each salary to the
  next" at all.
- **The signout revoke finding understated itself.** `revokeToken` caught thrown
  errors *and* never inspected `response.ok`, so a 400 from Google — which does
  not throw — was equally invisible.

Every line number in the original handover is now stale for files this work
touched.

## Decisions you made

| decision | outcome |
|---|---|
| Startup dedupe ceiling | Per **pay cycle**, not per calendar month. The pass keeps deleting, because it is what cleared the 620 € of re-log copies; a true double charge inside one cycle is still collapsed. Recorded in `agentics-rulings.md`. |
| Cycle-delimiting salaries | **Global across all accounts.** `period.ts` had no account notion, and per-account boundaries would break the ruling that the three screens never disagree. |
| `'1,000'` in an amount field | **Valid, parses to 1.** Comma is the decimal separator. Rejected: `1-2`, `1,000,5`, bare `-`, `1,2,3`, `1.2.3`, `--1`, `1.2,3`. |
| Empty `categoryId` on update | Clears to **`undefined`**, not `'cat-autre'`. `calc.ts` already falls back at read time, and income transactions deliberately carry `undefined`. |
| F030 hand-deleted transactions | **Reopen the instalment.** The old behaviour was deliberate, but its rationale rested on a leaky calendar-month ceiling. The per-cycle ceiling now makes reopening safe. |
| 400-day session TTL | **Kept.** See below. |

## Kept deliberately, not fixed

**The 400-day session TTL** (`api/_lib/session.ts:25`, `SESSION_TTL_SECONDS =
34_560_000`). Examined and kept at the browser maximum so you stay signed in on
both machines. What you are accepting: a session cookie stolen from a browser
profile mints `drive.file` tokens for up to 400 days and nothing server-side can
cut it off. What stands against that today: `httpOnly`, `Secure`, `SameSite=Lax`,
AES-256-GCM sealing with an authenticated expiry, PKCE on the flow, scope limited
to `drive.file` so only files this app created are reachable, and a refresh token
that never leaves the server. Real revocation would need a session store, which
this app has no database for — that is an architecture change, not a patch.
`api/_lib/session.test.ts:128` pins `SESSION_TTL_SECONDS === SESSION_MAX_AGE`, so
the two move together if you ever change your mind.

**`api/_lib/adapter.ts:38-43`**, the 503 that lists missing env var *names* to an
unauthenticated caller. Its own comment says this is deliberate; names only, no
values. Left as the author intended.

## Constraints this repo now has on agentics runs

Learned the expensive way; each one cost a run.

1. **Never exclude `**/*.test.ts` in `agentics.yaml`.** `kernel/testparse.py`
   applies `project.exclude` to *test discovery*, and `TEST_FILE_GLOBS["jest"]`
   is exactly those patterns. Excluding them hid all 48 suite files, so
   `relevant_tests` could never be satisfied and every run died at
   implementation. Measured: 0 test files found with them, 48 without.
2. **Never use `it.each` / `describe.each` with a `%j`/`%s`/`%i` placeholder.**
   The regression guard matches the *names* of new tests against the names that
   fail on the reverted tree. A parameterised test is declared under its template
   name and fails under expanded names, so the guard reports `NOT_AVAILABLE` and
   `G-TEST-GUARDS` fails even when the tests are sound.
3. **Tell every run not to create scratch files.** The developer role has
   Read/Edit/Write/Glob/Grep and *no delete*, and its rules forbid shell file
   changes. A reviewer flagging a stray `.tmp` deadlocks the run — three
   implementation rounds, then `valid: false`.
4. **Tell every run not to run `tsc`.** These tsconfigs are composite, so any
   `tsc` writes `tsconfig.{api,app,node}.tsbuildinfo`, which the kernel records
   as unapproved changes and the reviewer fails `scope_discipline` for.
5. **Run them one at a time.** Concurrent runs share one knowledge base, and a
   doc-writer refuses its document if the base changes under it — "the kernel is
   the only writer". Parallelism also saturated the CPU enough to make a
   timing-sensitive test flake, which failed a run's `G-TEST-EXIT`.
6. **`--placement <domain>` works on `run`, not just `--document-only`.** Passing
   it up front skips the knowledge-placement park.
7. **`npm run typecheck` is not in the kernel's suite, and cannot be.** Adding it
   to `tests.authoritative` makes `tsc -b` write those `.tsbuildinfo` artefacts
   into the measured change set. Two type errors reached `main` this way
   (`cadence: 'monthly'`, and a `TS2454` on a synchronous `resolveFn`); both were
   caught by running typecheck on `main` after each merge. Keep doing that.

## New debt, paid

The runs duplicated a private `localDateOf` into three files while
`src/lib/date.ts` already existed for it. Consolidated in `e9bf652`:
`localDateOf`, `utcDay` and `addDays` now live in `date.ts`, `addDaysISO` is
built on `addDays`, and `date.ts` gained the test file it never had.
`G-NO-DUPLICATION` does not catch cross-file private helpers — worth watching.

## One consequence of the last run

`51f6aca` renames the session cookie to `__Host-argent_session` on HTTPS
deployments. **Every existing session is invalidated**, so anyone signed in on a
deployed build is signed out once and must re-authorise with Google. Local http
keeps the unprefixed name so the dev loop is unaffected.

## Where the work is

Per-run reports: `../gestionmoney-agentic-reports/<mission>/run_*.md`.
Agent transcripts: `agents_run_*.md` beside each.
Mission notes: `secondbrain/missions/<mission>.md`.
New knowledge note: `secondbrain/general/gestionmoney-recurring-attribution.md`.

---

# Passation — codebase audit, 2026-10-30

Every finding from agentics run `run_75aef2189e` (ANALYSE workflow, 13/13 gates PASS,
$2.85, 15 invocations). 41 findings: 11 major, 19 minor, 11 nit.

- Kernel report: `../gestionmoney-agentic-reports/codebase-audit/run_75aef2189e.md`
- Per-agent transcript: `../gestionmoney-agentic-reports/codebase-audit/agents_run_75aef2189e.md`
- Raw artifacts: `/mnt/data2/DiskG/MEGA/Code/agentics/runs/run_75aef2189e`
- Mission note: `secondbrain/missions/codebase-audit.md`

Coverage, measured by the kernel: **117 of 117 files read in full.** The `F0xx` ids match
the kernel report, so anything here can be traced back. The `review` column of that table
is the reviewer's independent verdict on each analysis finding: 35 confirmed, 1 disputed.

**ANALYSE changes nothing and certifies nothing.** These are model judgements cross-checked
against kernel-measured facts. Each one worth fixing becomes its own `--bugs` run.

---

## Read this first

One bug loses data on every app start. Ten more are the same disease: the pay-cycle ruling
landed in `budget.ts` and `period.ts` but never reached the screens, so every list, count
and confirm button still thinks in calendar months. Two majors are unrelated and real. The
`api/` security surface was audited for the first time and came back clean of anything major.

Suggested order:

1. **F003 + F017** — startup deletion. Data loss, in production, today.
2. **F018** — `payAnchorDay` picks the wrong income type. Everything cycle-shaped sits on it.
3. **F029 + F033** — the owed/paid primitives. F001, F002, F008, F015 are their callers.
4. **F019** — `Left to spend` double-counts yearly expenses.
5. **F016**, **F025**, **F020** — independent data-integrity bugs, cheap to fix.
6. Security hardening, the minors, then the nits.

---

## 1. Data loss at startup — fix this first

**F003** `src/App.tsx:83-92` · major · correctness · confirmed
**F017** `src/lib/recurringDedupe.ts:27-111` · major · correctness · confirmed

`dedupeRecurringMonths()` runs on every start, after `backfillOccurrences()`, and deletes
transactions — the log says `removed %d duplicate instalment(s)`. `MAX_PER_MONTH = 1` is a
*calendar*-month ceiling, so it deletes every instalment past one per calendar month along
with its transfer siblings and history rows.

Both rulings say otherwise: a pay cycle may legitimately put two entries of the same monthly
expense in one calendar month, and existing entries stay as stored, none deleted or rewritten.
So a valid second entry is silently removed, balances change, and the deletion is pushed to
Drive. The comment above the effect still describes the old per-calendar-month rule.

Blast radius: transaction data for every monthly recurring expense with two cycle entries in
one month, plus balances and the Drive backups.

Note for whoever fixes it: `recurringDedupe.test.ts` pins the old one-per-calendar-month rule.
That test has to change as a deliberate decision, not quietly.

---

## 2. The pay-cycle cluster

The ruling: a cycle starts at each "Salaire" income, monthly expenses follow cycles, a
calendar month may hold 0, 1 or 2 entries, weekly and yearly keep their own schedule, and a
yearly expense is owed only in its creation-anniversary month. The libs below still key on
the calendar month, so the screens contradict both the ruling and each other.

### F018 `src/lib/period.ts:38-50` · major · confirmed
`payAnchorDay` takes the cycle start from the day-of-month of the last Salaire payment — or
else from **any** monthly recurring income with `dueDay > 1` (`r.direction === 'income' &&
r.cadence === 'mensuel'`, no `incomeType` check). The ruling says only "Salaire" opens a
cycle. A single fixed anchor day is also not "from each salary to the next": a salary that
lands early or late shifts every cycle.
Blast radius: `periodOf`, `periodBounds`, `useBudgetPeriod`, `useMonthSummary`,
`useVariableExpenses`, `useMonthExpenses`, `computeAutoBudget`, `budget.settledIn`. Every
screen's month grouping sits on this.

### F029 `src/lib/recurring.ts:217-259` · major · confirmed
`confirmRecurring` uses `nextUnpaidOccurrence`, a calendar-month key
(`paidEntryIn(r, occurrence.slice(0,7))`), and counts per calendar month against
`MAX_PER_MONTH`. It returns `null` or an existing id once the calendar month holds an entry,
so a second pay-cycle entry in the same calendar month can never be logged. The ruling says
the payment settles the instalment of its transaction date's cycle, with a calendar-month
fallback only before the first Salaire. `isConfirmedIn` (142-144) and `paidEntryIn` (154-157)
are calendar-month based too.

### F033 `src/lib/recurringSchedule.ts:62-100` · minor · confirmed
`paidMonths`, `isOccurrencePaidIn` and `nextUnpaidOccurrence` are keyed to the calendar month
for monthly templates, with no notion of pay cycles — the ruling is simply not implemented
here. Separately, `createdAt.slice(0,10)` (line 85) is a UTC date compared against a
local-date `today`, which can be off by a day near midnight.

### F019 `src/lib/budget.ts:42-64` · major · confirmed
`upcomingCommitments` subtracts every unsettled expense recurring as `monthlyEquivalent`
(`hebdo*52/12`, `annuel/12`) every period. The ruling: a yearly expense is owed only in its
anniversary month, weekly and yearly keep their own schedule, and "Left to spend" subtracts an
owed monthly expense at its full amount. `settledIn` uses an anchor-day period (`periodOf`)
rather than pay cycles, and a passed unfilled cycle is not treated as owed.
`computeAutoBudget` (96-120) also counts every expense recurring, yearly included, at 1/12
every month.
Blast radius: Dashboard "Left to spend" (`Dashboard.tsx:78`), the Budget screen, the home hero
via `useAutoBudget`. `budget.test.ts` pins the current behaviour.

### F001 `src/features/dashboard/Dashboard.tsx:54-56` · major · confirmed
The "to confirm" list is `recurrings.filter((r) => !isConfirmedIn(r, month))` with
`month = currentMonth()` and the **unscoped** `useRecurrings()`. The same screen computes
"Left to spend" from `upcomingCommitments(scopedRecurrings, period.month, period.anchor)`,
which is cycle-based. So the list and the hero above it can disagree about the same bill — and
the list ignores the account scope the hero respects.

### F002 `src/features/dashboard/Dashboard.tsx:328-343` · major · confirmed
The Confirm button treats a `null` from `confirmRecurring(row)` as "month full"
(`recurring.monthFullToast`). That `null` comes from the calendar-month ceiling, so a bill
still owed in the current cycle is refused as "month full". The pre-filled date is also not
guaranteed to fall inside the owed cycle.

### F015 `src/features/recurring/Recurring.tsx:45-63` · major · confirmed
`month = currentMonth()`, and `isConfirmedIn(r, month)` drives todo/done, the toggle
(`unconfirmRecurring(r, dueDateFor(r, month))`) and the history rows. Nothing in this file or
in `src/lib` refers to pay cycles. Weekly and yearly expenses go through the same
`isConfirmedIn`, so a yearly expense reads as owed every single month.

### F008 `src/features/settings/Settings.tsx:104-105` · major · confirmed
`todoCount = recurrings.filter((r) => !isConfirmedIn(r, currentMonth())).length` — owed per
calendar month, so the badge can disagree with both other screens. Yearly and weekly are
counted as owed monthly here too.

### F032 `src/lib/recurringMigration.ts:58-81` · minor · confirmed
`backfillOccurrences` rewrites the `occurrence` of entries that already have one and are
judged misattributed (line 67, `isMisattributed`), and encodes the calendar-month attribution
(line 37, `dueDateFor(r, tx.date.slice(0,7))`). The ruling says existing entries stay as
stored. Reported as in tension with the ruling rather than as a clear bug.

---

## 3. Independent correctness bugs

### F016 `src/lib/accounts.ts:84-105` · major · confirmed
`deleteAccountWithReassign`: step 2 reassigns only rows with `accountId === id` and updates
`counterAccountId` only on those rows. The partner leg of a transfer — on the target or on a
third account — keeps `counterAccountId === id`, which is now deleted. Step 3 collects only
legs where `counterAccountId === reassignToId`, so for a transfer between the deleted account
and the target only one leg matches, `legs.length >= 2` never fires, and the self-transfer is
never collapsed despite the doc comment. You are left with meaningless same-account transfer
pairs and a dangling `counterAccountId` that renders as "other" in `transferLabel`. Balances
are unaffected.

### F025 `src/lib/categories.ts:49-66` · minor · confirmed
`deleteCategory` reassigns transactions and strips budget limits but never touches
`db.recurrings`, which is not even in the transaction scope. Recurring templates keep the
`categoryId` of a deleted category, so `settleAsMovement` writes a dangling `categoryId` into
every new transaction it creates. The function header claims deletion reassigns to "Autre".

### F020 `src/lib/recurring.ts:262-280` · minor · confirmed
`unconfirmRecurring` rewrites history from the caller's React snapshot
(`recurring.history.filter(...)`) **outside** the db transaction, and unlike `confirmRecurring`
it does not re-read the template. A stale snapshot overwrites newer history entries — exactly
the race the confirm path explicitly guards against. Undo can silently drop history and reopen
months.

### F030 `src/lib/transactions.ts:82-84` · major · **DISPUTED**
The analyst's claim: `deleteTransaction` only runs `db.transactions.delete(id)`, so a recurring
history entry keeps its `transactionId`; `paidOccurrences`
(`recurringSchedule.ts:49-53`) counts any entry with a `transactionId` without checking the
transaction still exists, leaving the instalment readable as paid and impossible to log again.

The reviewer disputed it, and the dispute holds up against source. `recurringDedupe.ts:94-97`
documents the behaviour on purpose:

> History entries are dropped only for the transactions this pass deleted. An entry whose
> transaction the user removed by hand is left alone: it still means "this month is settled",
> and clearing it would reopen the month and invite the duplicate all over again.

So this is a design choice, not an oversight. **But the reviewer also says the consequence is
real**: the instalment cannot be logged again. Treat it as a product question — is "deleted by
hand still means settled" what you want? — not as a bug to patch.

### F027 `src/lib/google/loadScripts.ts:12-45` · minor · confirmed
A failed load is cached forever: the rejected promise stays in `cache`, so later calls never
retry the script. And when a matching `<script>` tag already exists, only `load`/`error`
listeners are attached — if that script already finished loading, the promise never settles and
the Picker hangs. One transient network failure makes the Picker unusable until a page reload.

### F021 `src/lib/google/auth.ts:153-164` · minor · confirmed (merged with a security nit at `:158`)
`withTokenRefresh` decides whether to retry with `/401/.test(e.message)`. Any error whose
message merely *contains* "401" — a Drive error body, an id inside
`google-upload-failed (500) {...}` — clears the cache and retries the whole operation, which
can duplicate an upload on a non-auth failure. A true 401 whose message omits the status code
would not match.

### F031 `src/store/SettingsContext.tsx:72-83` · minor · confirmed
The OS theme-change listener is registered with `[]` deps, so `onChange` reads `settings.theme`
from the first render's closure — `DEFAULT_SETTINGS`, not the stored value. The
`settings.theme === 'system'` guard therefore never tracks the user's choice. If the default is
`system`, a user who picked light or dark gets `applyTheme('system')` on an OS theme flip,
overriding them. If the default is not `system`, live OS following never works at all. The
exhaustive-deps rule is disabled on this effect.

### F023 `src/features/transactions/TransactionForm.tsx:92-94` · minor · confirmed
The `?category=` preset is taken verbatim as `categoryId` without checking it exists in
`categories`. A stale or bogus id leaves the Select on its placeholder, and
`categoryId || 'cat-autre'` does not rescue it because a bogus id is still a truthy string — so
the expense saves with a dangling category. `(isExpense ? presetCategoryId : '') ?? ''` is also
redundant.
Blast radius: home quick-log tiles, deep links to `/expenses/new?category=...`, `byCategory`
stats, category labels.

### F022 `src/hooks/selectors.ts:37-40` · minor · confirmed
`useCategories` and `useIncomeTypes` (69-72) call `.sort()` **in place** on the array returned
by `useLiveQuery`, while sibling selectors use `.slice().sort()`. That mutates a shared Dexie
live-query reference inside `useMemo`.

### F011 `src/features/statistics/Statistics.tsx:118-123` · minor · confirmed
`new Date(iso)` parses a date-only ISO string as UTC midnight, but `getDay()` reads local time.
West of UTC, every week-view bar label is one day early.

### F010 `src/features/onboarding/Onboarding.tsx:228-230` · minor · confirmed
The input filter `/[^0-9,.-]/g` allows `-` and `,` anywhere, and
`Number.parseFloat(balance.replace(',', '.'))` replaces only the first comma. `"1-2"` silently
becomes 1, `"1,000,5"` becomes 1, a stray `"-"` falls back to 0 — the opening balance is saved
wrong with no validation message.

### F036 `src/lib/transactions.ts:61` · nit · confirmed
`updateTransaction` writes `patch.categoryId` as-is, so an empty string is stored as
`categoryId: ''`. Sub-category and income sub-type clear empty strings to `undefined`, and the
`TransactionInput` doc says "Empty string clears it" only for those two — so the handling is
inconsistent. Affects `stats.ts` `bySubcategory` and `filterByCategory` on edited transactions.

### F035 `src/store/ToastContext.tsx:27-50` · nit · confirmed
The timers map is never cleared on provider unmount, so pending timers can fire afterwards. A
toast pushed with `duration` 0 or negative is dismissed immediately.

---

## 4. Missing error handling

Four async handlers have no `try`/`catch`, and the inconsistency is the tell — sibling code in
the same app handles the same calls.

| id | where | what happens |
|---|---|---|
| F009 | `src/features/onboarding/Onboarding.tsx:28-35` | `finish` sets `busy = true` then awaits `createAccount` with no `catch`/`finally`. If it throws, `busy` stays true, the Create button is disabled for good, the rejection is unhandled and the user is told nothing. A failed IndexedDB write strands the user on step 1. Settings' import and clear reset `busy` on error. |
| F012 | `src/features/statistics/Statistics.tsx:145-147` | `handleExport` awaits `exportBackup()` and `downloadBackup()` bare — a failure is an unhandled rejection with no feedback. `Settings.tsx` handles the same call and shows `settings.exportError`. Also duplicates the export logic that lives in Settings. |
| F024 | `src/features/transactions/TransactionForm.tsx:211-215` | `handleDelete` awaits `deleteTransaction` with no catch and no error toast, while `handleSave` right beside it handles errors. Same pattern in `Transfer.tsx` `handleDelete` (150-154). Failures surface only through the global fatal handler. |

---

## 5. Security

**The `api/` surface was audited here for the first time.** Earlier runs never saw it: the
profile's `source_globs` stopped at `src/`. 19 files read — the whole real auth surface.

The reviewer's verdict, verbatim:

> No blocking or major security defects in the audited files. The OAuth flow uses PKCE, a state
> cookie compared in constant time, AES-256-GCM sealing with an authenticated expiry, httpOnly
> cookies, and tokens held in memory only. `fatalScreen.ts` uses `textContent`, so the error
> screen has no injection sink. [...] Nothing in the db, seed, form or migration files shows an
> injection or authorisation defect.

Nothing blocking. Hardening items only:

| severity | where | finding |
|---|---|---|
| minor | `api/_lib/handlers.ts:61-70` | `sameOrigin()` lets through any request carrying **neither** `Origin` nor `Sec-Fetch-Site`. A non-browser client can omit both, but it cannot send the victim's cookie, so exposure is small; `SameSite=Lax` is the only remaining control on old browsers. The signout and token endpoints are not tied to a CSRF token. |
| minor | `api/_lib/handlers.ts:94-169` | The callback binds the code exchange to the session only through the state and verifier cookies. Both are checked, but a user-controlled `state` matching an attacker-planted cookie (cookie tossing from a sibling subdomain) still passes. Cookies are `Path=/api/auth` with no `__Host-` prefix. The `error` param is checked after state validation, which is correct. Login CSRF or session fixation needs an attacker-controlled sibling subdomain; a leaked session cookie gives long-lived ability to mint `drive.file` access tokens. |
| minor | `api/_lib/adapter.ts:38-43` | A 503 to any unauthenticated caller returns `detail`, listing the **names** of missing env vars (e.g. `SESSION_SECRET`). The code comment says this is deliberate. Names only, no values — but it discloses deployment config on a misconfigured deploy. |
| minor | `src/components/ErrorBoundary.tsx:20-30` (F004) | The comment calls it a "dev aid", but the fallback always renders `error.message` and `error.stack` to the user with no `import.meta.env.DEV` gate. In a finance app that exposes internal paths and stack frames in production. The English "Render error" and inline colours also bypass i18n and theming. Mounted in `src/main.tsx`. |
| minor | `src/lib/google/drive.ts:101-103` (F026) | `fileId` is interpolated **unencoded** into the URL path (`${DRIVE_FILES}/${fileId}?alt=media`), same in `deleteFile` (150). The id comes from the Picker or Drive listings and is not validated, so a crafted id containing `/`, `?` or `..` could redirect an authenticated bearer-token request. Query values go through `escapeDriveQueryValue`; path ids do not. Inputs are mostly Google-supplied, so exposure is low. The `deleteFile` docstring still says "keep-last-5", which is stale. |
| nit | `api/_lib/cookies.ts:1-3` | No `__Host-` prefix on cookie names. `Path=/api/auth` rules it out for the temporary cookies; the session cookie uses `Path=/` and could take it, but would lose the non-Secure local-http fallback (`secure` is derived from the origin scheme). |
| nit | `api/_lib/handlers.ts:228-248` | Signout revokes the refresh token at Google then clears the cookie; non-POST gets 405. **A failed revoke is swallowed silently**, so the user is told they are signed out while the grant stays live at Google. |

**One item named in the verdict prose but never recorded as a structured finding:** a *400-day
session with no server-side revocation*. Verified against source —
`api/_lib/session.ts:25` is `export const SESSION_TTL_SECONDS = 34_560_000;`, which is exactly
400 days. Combined with the `handlers.ts:94-169` note that a leaked session cookie mints
`drive.file` tokens, and with signout's silent revoke failure, this is worth a decision. It is
not in the findings table, so nothing tracks it but this document.

---

## 6. Dead code and cosmetics

| id | where | finding |
|---|---|---|
| F007 | `src/components/ui/Chip.tsx:9-18` | The `tint` prop is documented "Unused for default rendering … kept for API compat" and is never destructured or used. `AmountText`'s `locale` prop (7-13) is likewise accepted and ignored. Type surface only — callers passing them get no effect. |
| F013 | `src/features/statistics/Statistics.tsx:114-115` | `todayN` is created and `setHours`'d in the week branch, never used. |
| F028 | `src/hooks/selectors.ts:272-279` | `useYearExpenses` has no non-test caller. Same for `pickFile` (`google/picker.ts:71`), `isCurated` (`currency.ts:46`), `formatTime` (`format.ts:104`) and `incomeTypeRecordLabel` (`labels.ts:73`) — found by Grep, no non-test references. No runtime impact, but `useYearExpenses` ignores cycles and will drift against the pay-cycle work. |
| F034 | `src/store/SettingsContext.tsx:47-90` | `firstApply` is set true then flipped false, but its value is never read to branch on. A no-op ref; the comment "skip the initial hydration" is not implemented. |
| F006 | `src/features/dashboard/Dashboard.tsx:100-113` | The comment says "Most-used expense categories this month", but `topCategories` counts every expense in `allTx` — all time, all accounts, ignoring `scope` and the period. Affects only the ordering of the quick-log tiles. |
| F014 | `src/features/incomeTypes/IncomeTypes.tsx:245-248` | The preview title renders `{label}` immediately followed by `(${incomeSubtypeLabel(subtypes[0])})` with no separator, so it reads "Salaire(Bonus)". Cosmetic, inside the income-type edit sheet. |
| F005 | `src/features/accounts/Accounts.tsx:70-72` | The summary caption hardcodes `{accounts.length} · €`, ignoring the active currency setting that `formatCurrency` honours (`DEFAULT_SETTINGS.currency`, `customCurrencies`). Opening-balance inputs hardcode a `€` suffix at 292-297, and `src/features/budget/Budget.tsx` does the same at 369-374. Non-EUR users see the wrong symbol. |

---

## 7. How much to trust this

- **35 of 36** analysis findings were confirmed by an independent reviewer stage. One (**F030**)
  was disputed, and the dispute is correct — see §3.
- Review covered all nine dimensions: implementation_correctness, logic_correctness,
  regression, security, code_quality, scope_discipline, architecture, performance,
  test_quality. `finding_ids_unaccounted: []`.
- The note-critic **refuted nothing** (0 refuted, 14 corroborated, 7 unverifiable).
- Several findings carry their own caveat in the kernel's `basis` field: on some shards the
  analyst saw `recurring.ts` and `budget.ts` only through Grep snippets, not as opened files.
  F001, F002, F029 and F030 say so explicitly. **Confirm against source before fixing.**
- The seven statements the critic could not verify either way: the "existing entries stay as
  stored" contradiction; the missing-error-handling cluster; the breadth of a pay-cycle bugfix
  mission; "needs a product decision"; the security-minor summary; "yearly and weekly counted
  as owed every month"; "Dashboard, Recurring and Settings cannot honour the pay-cycle rulings".

**Not measured:** anything outside `/mnt/data2/DiskG/MEGA/Code/gestionmoney` and the
secondbrain. Root-level configs (`vite.config.ts`, `vitest.config.ts`) are outside the globs.
Test files are excluded from source by design.

---

## 8. Scope note: the profile had to be fixed first

The first attempt, `run_9874f8aa7d`, **FAILED on `G-SECURITY`** and cost $4.67 for nothing
usable. The security stage walks the whole tree rather than `source_globs`, so a gitignored
`.venv` of 21 672 files put 136 vendored litellm Prisma `migration.sql` into the security
shards. Both reviewers read 4 files out of 140, correctly refused to call the other 136 clean,
and the kernel emitted `security_review.coverage_partial`.

Fixed in commit `214cea4`, which also widened the globs to `api/**/*.ts` and declared
`tests.fast`. Security shard went from 146 files to 19; all 13 gates passed.

That run's one claim worth correcting: it reported `.venv` as "probably committed to the
repository". It is not — `git ls-files .venv` returns 0 and `.gitignore:21` carries `.venv/*`.

Re-run this audit with:

```bash
/mnt/data2/DiskG/MEGA/Code/agentics/agentics run \
  --project /mnt/data2/DiskG/MEGA/Code/gestionmoney/agentics.yaml \
  --mission codebase-audit --runtime claude-code --analyse
```
