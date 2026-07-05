# Design System — Spending Tracker PWA

> Foundation spec. Every screen mock (`01–12`) references ONLY the tokens and
> component patterns defined here. If a screen needs a token not listed, add an
> 🔴 open question rather than inventing one.

---

## 1. Design Principles

- **Calm money.** Spending is a daily, sometimes anxious act. The UI is quiet, generous with whitespace, and never alarming unless the user is genuinely over budget.
- **Fast first.** The most common action (adding an expense) is reachable in one tap from anywhere and completes in <3 taps.
- **Numbers lead.** Amounts are the hero of every screen — large, tabular, perfectly aligned.
- **Mobile-first, thumb-friendly.** Primary actions live in the lower third of the screen; critical content stays above the fold on a 5.5" phone.
- **Offline-native.** No UI assumes a network. Every "pending" state is first-class.

Working name: **the app** (final brand name is an open question — see §12).

---

## 2. Color Palette

Exact hex values. Semantic tokens (e.g. `color/text/primary`) are built on these; screens should reference the **semantic role**, but hex is given here so there is no ambiguity.

### Primary (Indigo) — brand, primary actions, focused state
| Token | Hex | Use |
|---|---|---|
| `primary-50`  | `#EEF2FF` | tinted backgrounds, selected chip bg |
| `primary-100` | `#E0E7FF` | subtle primary fills |
| `primary-200` | `#C7D2FE` | primary borders on light fills |
| `primary-500` | `#6366F1` | default primary |
| `primary-600` | `#4F46E5` | **primary buttons / main brand** |
| `primary-700` | `#4338CA` | primary-pressed |

### Neutral (Slate) — text, surfaces, borders, dividers
| Token | Hex | Use |
|---|---|---|
| `white`     | `#FFFFFF` | light surface, modal bg |
| `neutral-0` | `#FFFFFF` | = white (alias) |
| `neutral-50`  | `#F8FAFC` | app background (light) |
| `neutral-100` | `#F1F5F9` | cards alt, input fill |
| `neutral-200` | `#E2E8F0` | borders, dividers |
| `neutral-300` | `#CBD5E1` | disabled, strong divider |
| `neutral-400` | `#94A3B8` | placeholder text, icons secondary |
| `neutral-500` | `#64748B` | secondary text |
| `neutral-600` | `#475569` | body text strong |
| `neutral-700` | `#334155` | headings on light |
| `neutral-800` | `#1E293B` | |
| `neutral-900` | `#0F172A` | app background (dark), max-contrast text |

### Success (Green) — under budget, positive, saved, sync complete
| Token | Hex | Use |
|---|---|---|
| `success-50`  | `#ECFDF5` | success bg |
| `success-500` | `#10B981` | success icon/progress |
| `success-600` | `#059669` | success-pressed |
| `success-700` | `#047857` | dark-mode success text |

### Warning (Amber) — approaching limit, caution, pending sync
| Token | Hex | Use |
|---|---|---|
| `warning-50`  | `#FFFBEB` | warning bg |
| `warning-500` | `#F59E0B` | warning icon/progress |
| `warning-600` | `#D97706` | warning-pressed |
| `warning-700` | `#B45309` | dark-mode warning text |

### Danger (Red) — over budget, delete, error
| Token | Hex | Use |
|---|---|---|
| `danger-50`  | `#FEF2F2` | danger bg |
| `danger-500` | `#EF4444` | danger icon, delete swipe |
| `danger-600` | `#DC2626` | danger button bg |
| `danger-700` | `#B91C1C` | danger-pressed |

### Category color swatches (presets for custom categories)
`#4F46E5` indigo · `#0EA5E9` sky · `#10B981` emerald · `#F59E0B` amber ·
`#EF4444` red · `#EC4899` pink · `#8B5CF6` violet · `#14B8A6` teal ·
`#F97316` orange · `#64748B` slate

### Dark mode mapping
Dark mode is **inverted surfaces**, not a new palette:
- App background → `neutral-900` `#0F172A`
- Card / elevated surface → `#1E293B` (neutral-800)
- Border → `#334155` (neutral-700)
- Primary text → `#F1F5F9`, secondary → `#94A3B8`
- Primary actions stay `primary-600` (sufficient contrast on dark); danger/warning/success use `-500` with `*-50` text swapped for `*-700`/`*-500` where contrast demands it.

---

## 3. Typography Scale

- **Font family:** `Inter`, fallback `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`.
- **Amount numerals:** `font-feature-settings: "tnum" 1` (tabular figures) + `Inter` everywhere. No separate numeric font — keeps bundle small.
- Base unit conventions: `px (rem)`. Body default `16px` root.

| Role | Size | Weight | Line-height | Tracking | Use |
|---|---|---|---|---|---|
| `display-amount` | 40px (2.5rem) | 700 | 1.1 | -0.02em | Today's spent, big balances (tabular) |
| `amount-lg` | 28px (1.75rem) | 700 | 1.15 | -0.01em | transaction amount in hero cards |
| `amount-md` | 17px (1.06rem) | 600 | 1.3 | 0 | list-row amounts (tabular) |
| `h1` | 24px (1.5rem) | 700 | 1.3 | -0.01em | screen titles |
| `h2` | 20px (1.25rem) | 600 | 1.35 | 0 | section headers |
| `h3` | 16px (1rem) | 600 | 1.4 | 0 | card titles |
| `body` | 16px (1rem) | 400 | 1.5 | 0 | default text |
| `body-sm` | 14px (.875rem) | 400 | 1.45 | 0 | secondary, metadata |
| `caption` | 12px (.75rem) | 500 | 1.4 | 0.01em | timestamps, helper |
| `label` | 12px (.75rem) | 600 | 1.2 | 0.06em, UPPERCASE | field labels, section eyebrows |
| `button` | 15px (.9375rem) | 600 | 1 | 0 | button text |

---

## 4. Spacing Scale (4px base grid)

| Token | px | | Token | px |
|---|---|---|---|---|
| `space-0`  | 0   | | `space-6`  | 24 |
| `space-1`  | 4   | | `space-8`  | 32 |
| `space-2`  | 8   | | `space-10` | 40 |
| `space-3`  | 12  | | `space-12` | 48 |
| `space-4`  | 16  | | `space-16` | 64 |
| `space-5`  | 20  | | `space-20` | 80 |

**Screen padding:** `space-4` (16px) left/right gutter. Section gaps `space-4`–`space-6`.

---

## 5. Border Radius

| Token | px | Use |
|---|---|---|
| `radius-none` | 0 | — |
| `radius-sm`  | 6px  | small chips, badges |
| `radius-md`  | 12px | inputs, small buttons, chips |
| `radius-lg`  | 16px | cards, list rows, modal sheet top corners |
| `radius-xl`  | 24px | hero cards, FAB-adjacent surfaces |
| `radius-full` | 9999px | pills, FAB, avatars, numpad keys |

---

## 6. Shadow / Elevation

| Token | Value | Use |
|---|---|---|
| `shadow-none` | none | flat cards on neutral bg |
| `shadow-sm`  | `0 1px 2px rgba(15,23,42,.06)` | cards resting |
| `shadow-md`  | `0 4px 12px rgba(15,23,42,.08)` | raised cards, sticky bars |
| `shadow-lg`  | `0 10px 24px rgba(15,23,42,.12)` | modals, sheets, dropdowns |
| `shadow-fab` | `0 8px 20px rgba(79,70,229,.35)` | primary FAB only |
| `shadow-toast` | `0 8px 16px rgba(15,23,42,.16)` | toasts |

Dark mode: reduce shadow opacity ~40% and rely on `neutral-700` borders for separation instead.

---

## 7. Iconography

- **Style:** outline / stroked, consistent 2px stroke, rounded joins, **not filled**.
- **Library:** **Lucide React** (`lucide-react`) — clean, ~140KB tree-shaken, matches the minimal tone.
- **Default size:** 24px visual in a 24px box; `20px` inline; `16px` for in-row metadata.
- **Category icons:** Lucide subset chosen in Category Management (e.g. `ShoppingCart`, `Utensils`, `Car`, `Home`, `Film`, `Plane`, `HeartPulse`, `GraduationCap`, `Briefcase`, `Gift`, `Receipt`, `PiggyBank`).
- Touch target: icon may be 20–24px but the **tappable area is ≥ 44×44px** (invisible hit area padded out).

---

## 8. Component Patterns

### Buttons
| Variant | Appearance | When |
|---|---|---|
| **Primary** | bg `primary-600`, text white, `radius-md`, `space-3`×`space-4` padding, full-width on mobile; min height 48px | main confirm (Save expense, Set budget) |
| **Secondary** | bg `primary-50`, text `primary-700`, border `primary-200` | secondary confirm |
| **Ghost** | transparent, text `primary-600`/`neutral-700`, no border | cancel, nav, in-card actions |
| **Danger** | bg `danger-600`, text white, OR ghost with `danger-600` text + `danger-50` fill on press | delete, destructive confirm |
| **Disabled** | bg `neutral-200`, text `neutral-400`, no shadow | invalid form state |

Pressed: `scale(.98)` + darken one step, 120ms `ease-out`.

### Inputs / Form fields
- Text input: bg `neutral-100` (light), `radius-md`, `space-3`×`space-4`, 1px `neutral-200` border; **focus** border `primary-500` 2px + `primary-50` halo.
- Label above (`.label` role). Helper/error below (`.caption`); error text `danger-600`.
- Select: native `<select>` styled, or bottom-sheet picker on mobile.
- Toggle: pill track 44×24px, knob 20px, on=`primary-600`, off=`neutral-300`.

### Cards
- bg `white` (light) / `neutral-800` (dark), `radius-lg`, `shadow-sm`, padding `space-4`, gap `space-3`.
- Hero card: `radius-xl`, `shadow-md`, optional accent gradient (`primary-600`→`primary-500`).

### Chips
- Category chips, filter chips: `radius-full` or `radius-sm`, `space-2`×`space-3`, `body-sm`, icon-optional.
- States: default (bg `neutral-100`, text `neutral-700`), selected (bg `primary-50`, text `primary-700`, 1px `primary-200`).

### FAB (Floating Action Button)
- 56×56px circle, `radius-full`, bg `primary-600`, white `Plus` icon (24px), `shadow-fab`, bottom-right `space-4` above bottom nav (or center of bottom nav — see Nav Map).
- Press: `scale(.92)`, 150ms.

### Bottom Navigation
- Fixed bottom, bg `white`/`neutral-900`, top border `neutral-200`/`neutral-700`, safe-area padding-bottom.
- 4 destination icons + center FAB slot = 5 columns. Active: `primary-600` icon + `caption` label; inactive: `neutral-400`. Min tap target 48×48.
- Press: icon pop `scale(1.12)` 120ms, optional short underline.

### Top Bar
- Height 56px + safe-area top. Left: back chevron (pushed screens) or app title. Center/left: screen title (`h1`→`h3`). Right: contextual action (e.g. filter, edit). Sticky, bg `neutral-50`/`neutral-900` with `shadow-sm` on scroll.

### Modals & Sheets
- **Bottom sheet** is the default mobile pattern: slides up from bottom, `radius-lg` top corners, drag handle (40×4px `neutral-300`), `shadow-lg`, scrim `rgba(15,23,42,.45)`.
- **Center modal**: only for confirmations (delete budget, destructive) — small, centered, `radius-xl`, `shadow-lg`.
- **Fullscreen modal**: used for Add Expense (large numpad needs full height).
- Dismiss: swipe-down on sheets, scrim tap, Esc.

### Toasts / Snackbars
- Top or bottom (bottom preferred, above bottom nav), `radius-md`, `shadow-toast`, auto-dismiss 4s (errors 6s + manual dismiss), `body-sm` text + optional single action.
- Variants: default `neutral-800`, success `success-600`, warning `warning-600`, danger `danger-600`.

### Numpad (custom, large)
- 4 columns × 4 rows: `1–9`, decimal `.`, `0`, backspace (`Delete` icon). Keys are flex tiles, `radius-md`, `h3` numerals (28px+), bg `neutral-100`, press `neutral-200`, **haptic on tap** where available.
- Optional top row: quick amounts (`+5`, `+10`, `+50`) and currency symbol lock.
- Sticky to bottom safe area; never scrolls.

---

## 9. Motion

- **Standard ease:** `cubic-bezier(.2,.0,.0,1)` 200ms (enter/exit UI).
- **Emphasized:** `cubic-bezier(.3,.0,.0,1)` 280ms (FAB→modal morph, page transitions).
- Sheet/modal in: translateY 16px + opacity 0→1.
- List row add/delete: height + opacity animate; reflow uses FLIP.
- Number changes (amounts): optional count-up 300ms on dashboard totals; instant on direct input.
- Respect `prefers-reduced-motion`: disable count-up, FLIP, and scale pops; keep opacity-only fades ≤150ms.

---

## 10. Layout, Safe Areas & Touch

- **Content max width:** fluid full-width on phones; on ≥640px (tablet/desktop) center content in a `max-w-md` (448px) column with `neutral-100` backdrop so it still reads as a phone app.
- **Safe areas:** honor `env(safe-area-inset-*)` — top bar adds top inset, bottom nav + FAB add bottom inset (notch/home-indicator aware).
- **Touch targets:** minimum 44×44px (Apple HIG) / 48×48px (Material) for all interactive elements.
- **Z-index layers:** base 0, sticky bars 10, FAB 20, sheet/modal scrim 30, sheet/modal 40, toast 50, numpad inside modal 45.

---

## 11. Theming (Light / Dark / System)

- Three-way toggle in Settings: `light` | `dark` | `system` (follows `prefers-color-scheme`).
- Implemented via a `class="dark"` strategy or CSS variables — decision deferred to build, but all tokens must resolve in both themes.
- Theme persists in local storage; applied before first paint to avoid flash.

---

## 12. 🔴 Open Questions (block final build polish, not mock approval)

1. **App/brand name & logo** — currently referenced as "the app". Need a name + app icon set (maskable PWA icon 512², plus 192).
2. **Primary color direction** — indigo `#4F46E5` proposed. Confirm or swap (e.g. teal/green for a "money" feel).
3. **Font licensing** — Inter is OFL/free via self-host or Google Fonts. Confirm self-host (offline) is acceptable for offline-first.
4. **Currency formatting scope** — which locales/currencies at launch? Affects symbol placement, decimal rules, and i18n setup.
5. **Reduce-motion default** — should count-up/FLIP be off by default and opt-in, or on with opt-out?

---

## 13. Multi-Account, Income, Recurring & Transfer Model

(Added after scope expansion: the app tracks **multiple accounts**, **income**, **recurring (expected→confirmed)**, **transfers**, and **monthly rollover**.)

### 13.1 Accounts
- **Single currency** across the app (V1). Account **types** (simple):
  `courant` (checking), `épargne` (savings), `espèces` (cash), `autre`.
- Fields: `name`, `type`, `color` (preset swatch), `icon`, `openingBalance`, `createdAt`, `archived`.
- **Live balance** = `openingBalance` + Σ income − Σ expense + Σ transfers-in − Σ transfers-out.
- Default type colors: `courant` = `primary-600`, `épargne` = `success-500`, `espèces` = `warning-500`, `autre` = `neutral-500`.
- **Negative balances are allowed (DECIDED).** A live balance may legitimately be negative — e.g. an overdrawn `courant`, or an `espèces`/`courant` pushed below zero by an over-transfer. Negative amounts render with a leading `−` in `danger-600`; `openingBalance` may itself be negative. Transfers are **not** bounded by the source balance (see §13.2): an over-transfer simply drives the source negative rather than being clamped.
- **Lifecycle / deletion = soft delete + reassign (DECIDED).** Two steps, never destructive on the first:
  1. **Archive** (`archived=true`, soft delete): the account is excluded from the net-worth hero, the account switcher, and the transfer/income pickers, but **keeps its transactions & history**. Reversible via "Restaurer".
  2. **Permanent delete** (offered only from the archived list): if the account still has transactions, the user **must pick a reassign target** account (its transactions move there) before it can be removed; an account with zero transactions is removed outright. Past monthly rollovers stay immutable either way.
- **Budgets are per-account (DECIDED).** Total + category limits + alert threshold + rollover toggle are defined **per account** — there is no separate global/aggregate budget. The `Tous les comptes` scope is a **read-only sum** of per-account budgets and is never edited directly (Budget Settings 07 edits one account at a time; its `Tous` segment is disabled).

### 13.2 Transaction kinds
| Kind | Sign | Totals | Notes |
|---|---|---|---|
| `expense`  | − | counts as spend | tied to 1 account + category |
| `income`   | + | counts as income | tied to 1 account + income type |
| `transfer` | internal | excluded from income/expense | −from account, +to account |

**Direction badge** `.dir`: `in` = `success`, `out` = `danger`, `trf` (transfer) = `primary`. Never rely on color alone — always an icon + label.

**Transfer is not bounded by the source balance (DECIDED).** An amount may exceed the `from` account's balance — the transfer is accepted and the source goes negative (§13.1). No clamp, no block. The Transfer sheet may still show the source balance as context ("Dispo …") but it is informational, not a limit.

### 13.3 Income
- Fields: `account`, `amount`, `type`, `description`, `date`.
- **Income types** (managed list, distinct from expense categories): `Salaire`, `Remboursement`, `Cadeau`, `Freelance`, `Vente`, `Autre`.
- `type === 'Salaire'` is **special**: recording it finalizes the current month for that account and triggers the rollover (§13.5).

### 13.4 Recurring — expected, then confirmed
- A recurring is an **expected** scheduled amount on an account (e.g. Loyer, Abonnement Netflix, Salaire). It is **not** auto-deducted on a fixed date.
- Each period exposes a **pending occurrence** the user **confirms ("Pris / Effectué")** when the money actually moves on the real account. Confirming creates a real transaction for that period at the (possibly edited) amount.
- States: `expected` (`warning`), `confirmed` (`success`).
- **Amount is editable, forward-only**: changing it applies from now on; past confirmed occurrences keep their recorded amount. History is **immutable**.

### 13.5 Monthly rollover (per account)
- **Triggered** by recording the month's `Salaire` income on that account. Each account rolls over **independently** on its own salary entry — recording salary on account A rolls over only A (DECIDED).
- **Confirm dialog (DECIDED).** On Save of a `Salaire`, a center modal asks *"Clôturer le mois de `<account>` et reporter le solde ?"* with **Clôturer et reporter** (`primary-600`) and **Annuler** (ghost):
  - **Confirm** → closes the current month, marks it `closed`, and carries the account's **remaining balance forward** as next month's starting available. A report badge appears on Monthly Overview (*"+127 € reportés de mai"*). Past months are immutable.
  - **Cancel (DECIDED)** → the salary income **is still recorded** (it is real money and must persist), but the month is **left open**: no rollover, no close. The user may close/roll over later by recording salary again. Rollover is a separate explicit action, never silently tied to the save.
- **Rollover toggle (per account — Budget Settings 07 §E, DECIDED).** `ON` = at month close the unused balance is carried forward as next month's available (stacked on top of the fresh monthly budget). `OFF` = the month still closes but the budget "available" **resets** to the full monthly budget for the next month (the real account balance is unchanged; only the rollover top-up is skipped). This toggle is the single source of truth for whether a given account participates in balance carry-forward.

### 13.6 New components
- **Account selector chip** `.acct-chip` (top bar): type-colored dot + name + chevron → opens account switcher sheet (`Tous les comptes` + list + `Gérer`).
- **Segmented control** `.seg`: for scope (Tous / par compte), period, theme.
- **Quick-action sheet** (FAB): `.qas`-style 3 large tiles — **Dépense / Revenu / Virement** (+ Récurrent as secondary).
- **Direction badge** `.dir`, **Recurring row** `.recur` (`.pending` / `.done`), **confirm button** `.confirm-btn`.

### 13.7 New / revised screens
- **New:** `13-accounts.md`, `14-add-income.md`, `15-recurring.md`, `16-transfer.md`.
- **Revised:** Dashboard (02), Add/Edit Expense (03/12) gain an **account picker**; Monthly Overview (06) gains per-account scope + rollover badge; Statistics (08) & Budget (07) become account-aware; Settings (09) gains Accounts + Récurrents links; FAB becomes a quick-action chooser.

### 13.8 Decisions log (resolved) + remaining open questions
**✅ Resolved (product decisions confirmed by user):**
1. ✅ **Negative balances — ALLOWED.** Live balances and `openingBalance` may be negative; transfers are not bounded by the source balance (§13.1, §13.2).
2. ✅ **Transfer FX — single currency (€) only in V1.** Multi-currency stays out of scope; both transfer legs share €.
3. ✅ **Delete account — soft delete + reassign.** Archive by default (keeps transactions); permanent delete requires a reassign target when transactions exist (§13.1).
4. ✅ **Rollover timing — confirm dialog on Salaire save** (not immediate). Cancel on that dialog keeps the income recorded but leaves the month open (§13.5).
5. ✅ **Salary on multiple accounts — per-account, independent** rollover on each account's own salary entry (§13.5).
6. ✅ **Budgets — per-account only.** No global/aggregate budget; `Tous` is a read-only sum (§13.1, Budget Settings 07).
7. ✅ **Rollover toggle semantics — ON = carry balance forward; OFF = reset available to fresh budget** at month close (§13.5, Budget Settings 07 §E).
8. ✅ **Backup — JSON file exported to the user's cloud account (Google Drive / iCloud).** No app server; offline-first is preserved (manual export, not live sync). See §13.9.
9. ✅ **CSV import — app's own export format only.** No arbitrary bank-CSV column mapping in V1 (§13.9).
10. ✅ **Income types — managed in Settings (09)** as a separate list from expense categories (§13.3, Category Management 05).

**🔴 Still open (do not block build):**
- **Recurring cadence** — since nothing auto-deducts, is a cadence label (mensuel/hebdo/annuel) purely descriptive, or should the app *suggest* the next occurrence date?

### 13.9 Storage & Backup model (DECIDED)
- **Primary store: on-device.** All data (accounts, transactions, recurrings, budgets, categories, income types, settings) lives in a local client database — **IndexedDB** (recommended for structured, queryable offline data with generous size limits), with the service worker caching the app shell. The app is fully functional offline; **there is no app-side server and no live cloud sync.**
- **Backup = manual JSON export → user's cloud account.** From Settings → Données, a **"Sauvegarder (Google Drive / iCloud)"** action serializes the full dataset to a single `.json` file and hands it to the OS via the **Web Share API** (`navigator.share({ files })`) or the **File System Access API** / download fallback, so the user saves it into their own Google Drive (Android/desktop Chrome) or iCloud Files (iOS). Restore = re-import that same JSON (merge or replace).
  - This keeps the app **offline-first and serverless** — the user's own cloud account is the storage, not ours. No credentials, no auth, no per-user backend.
  - **CSV is export-only** (a flat projection for spreadsheet use). **Import accepts only the app's own export formats** (`.json` full backup, or the app's own `.csv` layout) — no arbitrary bank-CSV column mapping in V1.
- **Implication for Settings (09):** the "Sauvegarde cloud" row is **active** (not disabled/v2): it exports a JSON backup to the user's Drive/iCloud. The Import row is restricted to app-format files (with a note). See `09-settings.md`.
