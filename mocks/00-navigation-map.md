# Navigation Map — Spending Tracker PWA

> Foundation spec. All screen mocks (`01–12`) must agree with the hierarchy,
> bottom-nav membership, and gesture rules defined here.

---

## 1. Screen Hierarchy Tree

```
App Launch
│
├─ Splash / Onboarding (01)            [first launch only, one-time]
│     └─→ Dashboard (home)
│
└─ Root Shell (persistent bottom nav)
   │
   ├─ HOME  → Dashboard (02)              [bottom nav #1]
   │      ├─→ Add Expense (03)             [FAB → fullscreen modal]
   │      ├─→ Expense List (04)            [pushed, "See all"]
   │      │     └─→ Edit Expense (12)      [tap row → pushed/modal]
   │      ├─→ Edit Expense (12)            [tap recent row]
   │      └─→ Monthly Overview (06)        [tap hero/month chip]
   │
   ├─ STATS → Statistics (08)             [bottom nav #2]
   │      └─→ Monthly Overview (06)        [tap a bar/period]
   │
   ├─ [ + ] FAB → Add Expense (03)         [bottom nav center, fullscreen modal]
   │
   ├─ CALENDAR → Monthly Overview (06)     [bottom nav #4]
   │      ├─→ Budget Settings (07)         [pushed, "Adjust budget"]
   │      └─→ Statistics (08)              [pushed, "See trends"]
   │
   └─ SETTINGS → Settings (09)            [bottom nav #5]
          ├─→ Category Management (05)     [pushed]
          ├─→ Budget Settings (07)         [pushed]
          ├─→ Export / Import / Backup     [system action or sheet]
          └─→ About / theme / currency     [in-screen toggles + sheet]

GLOBAL OVERLAYS (not in the tree; appear above any screen)
   ├─ Offline Indicator (11)               [banner/snackbar, global]
   ├─ Install Prompt (10)                  [modal/banner, global]
   └─ Toasts                                [global, ephemeral]
```

---

## 2. Bottom Navigation (max 5 slots)

A 5-column bar: 4 destinations + 1 center FAB.

| Slot | Label | Icon | Destination |
|---|---|---|---|
| 1 | **Home** | `Home` | Dashboard (02) |
| 2 | **Stats** | `BarChart3` | Statistics (08) |
| 3 | **+** (FAB) | `Plus` | Add Expense (03) — fullscreen modal |
| 4 | **Calendar** | `CalendarDays` | Monthly Overview (06) |
| 5 | **Settings** | `Settings` | Settings (09) |

- Active state: `primary-600` icon + caption label; inactive: `neutral-400`.
- The FAB is always present on the 4 tab roots; it is hidden while Add Expense (03) or a sheet is open.
- Only **one** item is ever active. Selecting the active tab again scrolls to top (standard).

---

## 3. Back Button vs. Bottom Nav (per screen)

| Screen | Chrome | Has bottom nav? | Back behavior |
|---|---|---|---|
| 01 Splash/Onboarding | none | no | N/A (advances forward only) |
| 02 Dashboard | top bar (title, optional filter) | **yes** | exits app / nothing |
| 03 Add Expense | top bar (← Cancel, "Save") | **no** (modal) | Cancel → discard |
| 04 Expense List | top bar (← back, search) | no (pushed) | ← returns to Dashboard (or origin) |
| 05 Category Management | top bar (← back, "+ New") | no (pushed) | ← returns to Settings |
| 06 Monthly Overview | top bar (month picker) | **yes** | switches month, not back |
| 07 Budget Settings | top bar (← back, "Save") | no (pushed) | ← returns to origin (06 or 09) |
| 08 Statistics | top bar (period tabs) | **yes** | switches period, not back |
| 09 Settings | top bar (title) | **yes** | scrolls to top |
| 10 Install Prompt | modal (close ✕) | n/a (overlay) | scrim tap / ✕ → dismiss |
| 11 Offline Indicator | n/a (banner) | n/a (overlay) | auto-dismiss on reconnect |
| 12 Edit Expense | top bar (← back, "Save", overflow ⋯) | no (pushed/modal) | ← returns to list |

**Rule of thumb:** the 4 tab roots (02, 06, 08, 09) keep the bottom nav and never show a back chevron. Everything else is a pushed screen or modal with a back/cancel control and **no** bottom nav (avoids deep-nav confusion).

---

## 4. Deep Link / Route Table

| Route | Screen | Notes |
|---|---|---|
| `/onboarding` | 01 | shown only while onboarding flag is unset |
| `/` (or `/home`) | 02 Dashboard | default after onboarding |
| `/add` | 03 Add Expense | opened as fullscreen modal; deep-linkable |
| `/expenses` | 04 Expense List | query params for filters: `?cat=&from=&to=&q=` |
| `/expenses/:id` | 12 Edit Expense | edit by id |
| `/categories` | 05 Category Management | |
| `/overview` | 06 Monthly Overview | `?month=YYYY-MM` |
| `/budget` | 07 Budget Settings | |
| `/stats` | 08 Statistics | `?period=week\|month\|year` |
| `/settings` | 09 Settings | |

- Routes are client-side (hash or history); back/forward buttons and deep links must restore the exact filtered state where applicable.
- Onboarding route is a guard: if `hasOnboarded=false`, `/` redirects to `/onboarding`.

---

## 5. Gesture Navigation Rules

| Gesture | Where | Effect |
|---|---|---|
| **Tap FAB / +** | anywhere with bottom nav | opens Add Expense (03) fullscreen modal, slide-up + fade |
| **Swipe right (edge)** | pushed screens (04, 05, 07, 12) | OS back; mirrored by on-screen chevron |
| **Swipe down** | bottom sheets, modals (03 input sheet, 05 edit) | dismiss (drag handle follows finger; release past 40% → close) |
| **Swipe left on row** | 04 Expense List, 05 Categories | reveal delete/duplicate actions |
| **Tap scrim** | any modal/sheet | close (unless a form is dirty → confirm-discard first) |
| **Pull down** | 02 Dashboard, 04 List, 06 Overview, 08 Stats | refresh / re-sync from local store; spinner while syncing |
| **Long-press row** | 04 List, 05 Categories | multi-select / quick actions menu |
| **Double-tap FAB** | (optional) | repeat last expense — flagged open question |

**Dirty-form guard:** if the user has unsaved input (03, 07, 12) and attempts back/scrim/close, show a confirm-discard sheet ("Discard changes?"). This supersedes swipe-back.

---

## 6. Global State Influencing Navigation

- **Offline (11):** when offline, Add Expense still works; transactions are written locally and queued. A pending-sync badge appears on the FAB / toast. Navigation is fully functional offline.
- **Install prompt (10):** triggered by `beforeinstallprompt` + engagement heuristics (e.g. after 3rd expense or 2nd session). Can be re-opened from Settings.
- **First launch:** onboarding guard forces `/onboarding`; bottom nav and FAB are hidden until complete.

---

## 7. 🔴 Open Questions

1. **Expense List placement** — currently a pushed screen from Dashboard ("See all"). Should it instead replace one of the bottom-nav tabs (e.g. swap Home/Stats) for one-tap access? Recommendation: keep pushed to honor the 5-slot limit and keep Home as the hero.
2. **FAB tap vs. double-tap** — confirm whether "double-tap FAB = repeat last expense" is desired (fast re-entry) or risks accidental duplicates.
3. **Edit Expense as push vs. modal** — pushed screen proposed for full editing room. Confirm a bottom-sheet variant is not preferred.
4. **Tab re-selection = scroll to top** — standard behavior; confirm or change to "do nothing".
5. **Back from Dashboard** — should hardware-back on the Home tab exit the app, or show "press again to exit"? (Android convention.)

---

## 8. Multi-Account, Income, Recurring & Transfers (scope expansion)

The app is now **multi-account** with income, recurring (expected→confirmed), transfers, and per-account monthly rollover. Bottom-nav membership is unchanged (Accueil / Stats / + / Calendrier / Réglages); the new surfaces hang off existing entry points.

### 8.1 Updated hierarchy (additions only)
```
Root Shell
 ├─ HOME → Dashboard (02)              [scope: Tous les comptes | single account]
 │     ├─ account selector chip (top bar) → Account switcher sheet
 │     │     └─→ Accounts management (13)        [pushed]
 │     ├─ FAB → Quick-action sheet → { Dépense (03) · Revenu (14) · Virement (16) }
 │     ├─ "Récurrents à confirmer" section → Recurring (15)   [pushed]
 │     ├─→ Expense List (04) [account-filtered]
 │     └─→ Monthly Overview (06) [account-scoped]
 ├─ STATS → Statistics (08)            [account-scoped]
 ├─ [ + ] FAB → Quick-action sheet
 ├─ CALENDAR → Monthly Overview (06)   [account-scoped + rollover badge]
 └─ SETTINGS → Settings (09)
        ├─→ Accounts management (13)   [pushed]
        └─→ Recurring (15)             [pushed]

New modals/sheets
 ├─ Add Income (14)           [fullscreen modal, from Quick-action]
 ├─ Transfer (16)            [bottom sheet, from Quick-action / Accounts]
 └─ Account switcher sheet   [global, from top-bar chip]
```

### 8.2 New routes
| Route | Screen |
|---|---|
| `/accounts` | 13 Accounts management |
| `/accounts/:id` | edit account (sheet/push) |
| `/income` | 14 Add Income (modal) |
| `/recurring` | 15 Recurring management |
| `/transfer` | 16 Transfer (sheet) |

All scope-carrying screens accept `?account=all|<id>`; Add/Income/Transfer carry `?account=<id>` (default = last used).

### 8.3 FAB → Quick-action sheet
The single `+` FAB now opens a **quick-action sheet** (3 large tiles: Dépense / Revenu / Virement, + Récurrent secondary). Selecting one opens the corresponding fullscreen modal / sheet. Direct deep-link to `/add` still opens Add Expense for parity.

### 8.4 Rollover flow
Recording an income with `type = Salaire` on an account → **confirm dialog** "Clôturer le mois de `<account>` et reporter le solde ?" with **Clôturer et reporter** / **Annuler** (DECIDED, §13.5):
- **Confirm** → finalize the current month, carry the remaining balance forward, mark the month `closed`. Past months immutable. A report badge appears on Monthly Overview (06).
- **Cancel** → the salary income **is still recorded** (real money persists), but the month is **left open** — no rollover, no close. The user may close/roll over later by recording salary again.
- Each account rolls over **independently** on its own salary entry (per-account). Whether a given account's unused balance actually carries forward depends on its **Rollover toggle** in Budget Settings (07 §E): ON = carry forward; OFF = close but reset available to the fresh budget.

### 8.5 Account-aware navigation rules
- Accueil / Stats / Calendrier share an **account scope** via the top-bar selector chip; switching it updates the screen in place (no full navigation).
- Add Expense / Add Income / Transfer always show an **account picker** (default = last-used account, or the currently-scoped account).
- Transfers are **not** income/expense: excluded from category totals & donut, included in balances.
