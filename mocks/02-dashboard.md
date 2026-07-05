# Dashboard (02)

## Purpose
The default landing screen after onboarding — the daily home base for a **multi-account** personal finance app. It surfaces, at a glance: the **aggregate balance across all accounts**, this month's income and expense totals, each account's live balance with its pending recurring count, the recurring occurrences that are **expected but not yet confirmed ("À confirmer")**, and the most recent movements (Dépense / Revenu / Virement). The fastest path to capture is the center FAB, which opens a **quick-action sheet** (Dépense / Revenu / Virement). The screen is account-scoped via the top-bar **account selector chip** ("Tous les comptes" by default).

All money is in **euros (€)**, single currency, French UI. Tabular figures everywhere amounts appear.

## Navigation
- **Arrives from:** default route `/` (or `/home`) after onboarding; bottom-nav slot **#1 — Accueil** (`Home` icon) from any tab root. Per nav map §3, the Dashboard keeps top bar + bottom nav and shows **no back chevron** (it's a tab root).
- **Account scope:** the top-bar `.acct-chip` ("Tous les comptes") opens the **account switcher sheet**. Selecting an account switches the screen's scope in place (no full navigation); selecting "Tous les comptes" returns to the aggregate view. Accueil / Stats / Calendrier share this scope (nav map §8.5). Deep-link `/` accepts `?account=all|<id>`.
- **Goes to:**
  - **Account switcher sheet** → pick account, or **"Gérer"** → Accounts management (13), pushed (`/accounts`).
  - **FAB (+)** (bottom-nav center, `Plus`) → **quick-action sheet** (`.qas`): three large tiles **Dépense / Revenu / Virement** (+ Récurrent secondary). Dépense → Add Expense (03, fullscreen modal). Revenu → Add Income (14, fullscreen modal). Virement → Transfer (16, bottom sheet). The FAB is hidden while any sheet/modal is open (nav map §2).
  - **"À confirmer" → Récurrents (15)**: tapping the section header chevron (or "Tout voir") pushes Recurring management (`/recurring`). Confirming an occurrence inline (Pris/Fait) creates the real transaction without leaving the Dashboard.
  - **Per-account row tap** → Monthly Overview (06) scoped to that account, pushed (`/overview?account=<id>&month=YYYY-MM`).
  - **Hero tap** → Monthly Overview (06) for the current scope, pushed.
  - **"Tout voir"** (Mouvements récents header) → Expense List (04), pushed, scope-filtered to the current account selection (`?account=<id|all>`). Swipe-right edge returns here.
  - **Tap a recent movement row** → Edit Expense (12), pushed/modal by id (`/expenses/:id`). (Transfers and income rows tap into their respective edit screens.)
  - **Top-bar bell icon** → notifications/expected recurring summary sheet (optional; see Open Questions).
  - **Bottom nav:** Stats (08), Calendar (06), Réglages (09); selecting Accueil again scrolls to top (nav map §2, open Q §7 #4).
  - **Pull down** → refresh / re-sync from local store with a spinner (nav map §5).
  - **Offline:** fully functional; a pending-sync badge appears on the FAB when transactions are queued (nav map §6).

## Layout Description
Top-to-bottom. Screen background `neutral-50` (light) / `neutral-900` (dark). Content uses `space-4` (16px) left/right gutter; section gaps `space-3`–`space-4` (the mock uses a tight ~14px rhythm). On ≥640px, content centers in a `max-w-md` (448px) column on a `neutral-100` backdrop (design system §10). `padding-bottom` ~96px to clear the bottom nav + FAB.

### 1. Top bar (sticky, 56px + safe-area top)
- Background `neutral-50`/`neutral-900`, gains `shadow-sm` on scroll.
- **Left — account selector chip (`.acct-chip`):** a button, `radius-full`, bg `white`/`neutral-800`, 1px `neutral-200` border, padding ~`space-1`×`space-3`, height ~32px (hit padded to 44×44). Contents:
  - **Account dot** `.acct-dot`: an 8px circle. For "Tous les comptes" it is a **three-segment gradient** `primary-600 → success-500 → warning-500` (representing the multiple account types); for a single account it is the account's type color (e.g. `courant` = `primary-600`).
  - **Account name** `.acct-name`: "Tous les comptes" (aggregate) or e.g. "Compte courant" (scoped). `body-sm`/600, `neutral-700`/`neutral-100`.
  - **Chevron** `ChevronDown` (16px, `neutral-400`).
  - Tapping opens the **account switcher sheet** (bottom sheet, `radius-lg` top, drag handle, `shadow-lg`, scrim `rgba(15,23,42,.45)`): header "Compte", a "Tous les comptes" row at top (selected check when active), then one row per account (type dot + name + live balance), then a divider, then a **"Gérer"** ghost link → Accounts management (13).
- **Right — bell icon (`.icon-btn`):** a `Bell` ghost icon button (22px, `neutral-600`, 44×44 hit, `aria-label="Notifications"`). Shows a small `warning-500` dot badge when there are pending recurring occurrences due. Tapping opens a notifications sheet summarizing "À confirmer" items. 🔴 (see Open Questions — confirm whether the bell ships in v1).

### 2. Aggregate balance hero (full-width, `space-3`–`space-4` below top bar)
- Hero card: `radius-xl`, `shadow-md`, padding `space-5`, bg accent gradient `primary-600 → primary-500` (light) / `neutral-800` with `primary-600` accent border (dark).
- Stack, left-aligned:
  1. **Scope label** (`.label`, UPPERCASE, `rgba(255,255,255,.8)`): "SOLDE TOTAL · 3 COMPTES" (aggregate), or "SOLDE · COMTE COURANT" (scoped). The count of accounts appears only in aggregate scope. Updates live when scope changes.
  2. **Hero amount** (`.amount`, ~36px/700 here per mock — between `amount-lg` and `display-amount`; tabular figures, tracking -0.02em), white on gradient / `neutral-50` dark, e.g. **"3 842,50 €"**. Euro symbol placed **after** the number, space-separated (fr-FR). Optional count-up 300ms on data change (disabled under reduced-motion).
  3. **Two-column income/expense split** (flex row, `space-4` gap, ~14px below amount), divided by a 1px `rgba(255,255,255,.25)` vertical rule:
     - **Revenus (mois):** `caption` label `rgba(255,255,255,.8)` + `.amount-md` value white, sign-prefixed, e.g. **"+2 150 €"**.
     - **Dépenses (mois):** `caption` label + `.amount-md` value white, sign-prefixed, e.g. **"−1 240 €"** (uses U+2212 minus, not hyphen).
  - The split is always the **current calendar month** (mois en cours) for the active scope. Tapping the hero routes to Monthly Overview (06).

### 3. Per-account strip (full-width card, `space-3` below hero)
- Standard card: bg `white`/`neutral-800`, `radius-lg`, `shadow-sm`, tight padding (`space-2`–`space-3`). One **`.row`** per account (no section header in the mock; the account rows are self-evident). In scoped (single-account) view, this strip is **hidden** (the hero already shows that account).
- Each `.row` (tappable → Monthly Overview 06 scoped to that account, 44px+ tall):
  1. **Account icon tile** `.acct-icon`: 32×32px circle, `radius-full`, bg = type color at ~12% opacity, Lucide type icon (18px) in the type color. `courant` → `Wallet`/bank icon `primary-600`; `épargne` → `PiggyBank` `success-500`; `espèces` → `Banknote`/cash icon `warning-500`; `autre` → `CreditCard`/`Circle` `neutral-500`.
  2. **Name + meta column** `.r-main` (flex-grow): `.r-title` (14px/600) account name, e.g. "Compte courant"; `.r-sub` (caption, `neutral-500`) recurring status — "2 récurrents à confirmer" (with `warning-600` count emphasis when >0), else "—".
  3. **Balance** `.amount-md` (14px here, tabular, `neutral-900`/`neutral-50`): e.g. "2 190,30 €", "1 540,00 €", "112,20 €". No sign prefix on balances (a balance can conceptually be low but V1 forbids negatives — see Open Questions).
- A **recurring badge** is surfaced textually in `.r-sub`; if more than one account has pending recurring, each row carries its own count.

### 4. "À confirmer" recurring section (`space-3` below account strip)
- **Section header** `.section-head` (flex row, `space-2` below): left `.h3` "À confirmer"; right `.stat-pill` (caption, `radius-full`, bg `warning-50`, text `warning-700`) — "**2 échéances**" (count of pending occurrences for the scope). Tapping the header (or a trailing "Tout voir") → Recurring management (15).
- **Card** (bg `white`/`neutral-800`, `radius-lg`, `shadow-sm`, tight) with one `.recur` row per pending occurrence (capped at ~3 on the Dashboard; "Tout voir" for the rest). Each `.recur` row:
  1. **Category icon tile** `.cat`: 36×36px, `radius-full`, bg = recurring's category color at ~15% opacity, Lucide icon 20px in that color (e.g. Loyer → `Home` `danger-500`; Netflix → `Play`/`Tv` `#8B5CF6`).
  2. **Meta column** `.r-main`: `.r-title` recurring name ("Loyer", "Netflix"); `.r-sub` "Récurrent · Courant" (kind · account name).
  3. **Amount** `.amount-md .amt-out` (tabular, `danger-600`/`danger-500`): "−850 €", "−13,49 €".
  4. **Confirm button** `.confirm-btn`: a compact pill button, `radius-full`, ~32px tall (hit 44×44), `Check` icon (14px) + label. Two visual states:
     - **Pending** (`.confirm-btn`): bg `primary-600`, white text/icon, label **"Pris"**. Tap → creates the real transaction at the (possibly edited) amount, row animates to confirmed, toast `success-600` "Loyer confirmé · −850 €".
     - **Confirmed** (`.confirm-btn.done`): bg `success-50`, text/icon `success-600`, label **"Fait"**, `Check` icon. Non-interactive (or tap → undo within a short grace window).
- Hidden entirely when there are zero pending occurrences in scope (the whole section, including header).

### 5. Mouvements récents section (`space-3` below À confirmer)
- **Section header** `.section-head`: left `.h3` "Mouvements récents"; right "Tout voir" ghost link (`body-sm`, `primary-600`, 600 weight, no underline, 44×44 hit) → Expense List (04), scope-filtered.
- **Card** (tight) of up to ~5 most recent movements across all transaction kinds (expense, income, transfer) in scope, each a `.row` (tappable → edit screen for its kind, 44px+ tall):
  1. **Category icon tile** `.cat`: 36×36px, `radius-full`, bg = category/type color at ~15% opacity, Lucide icon 20px. Expenses use the category color (e.g. Courses → `ShoppingCart` `success-500`); income uses the income-type color (Salaire → `Banknote`/`ArrowDownCircle` `success-500`); transfer uses `primary-600` (e.g. `ArrowLeftRight`/`Repeat`).
  2. **Name + meta column** `.r-main`: `.r-title` movement name **with an inline `.dir` direction badge** (margin-left 4px), e.g. "Carrefour `[Dépense]`", "Salaire juin `[Revenu]`", "Virement → Épargne `[Virement]`"; `.r-sub` context — "Courant · 18:42" (expense), "Courant · 01/06" (income), "Courant → Épargne" (transfer).
     - **`.dir` badge:** `.out` = `danger` "Dépense"; `.in` = `success` "Revenu"; `.trf` = `primary` "Virement". Small pill (`radius-sm`/`radius-full`, caption, tinted bg + colored text). Never color-only — always label + icon context.
  3. **Amount** `.r-amt` (tabular, right-aligned): `.amt-out` `danger-600` "−28,90 €"; `.amt-in` `success-600` "+2 150 €"; `.amt-trf` `primary-600` "−200 €" (shown from the **source** account's perspective; the destination gains are visible in the account strip/transfer edit).
- Long-press a row → quick-actions sheet ("Modifier", "Dupliquer", "Supprimer"). Swipe-left is **not** used on the Dashboard (reserved for the Expense List 04) to prevent accidental deletes from home.

### 6. Bottom navigation (fixed, z-index 10)
- bg `white`/`neutral-900`, top border `neutral-200`/`neutral-700`, safe-area padding-bottom.
- 5 columns: **Accueil** (active, `primary-600`, `Home`), **Stats** (`BarChart3`, `neutral-400`), **+ FAB** (`Plus`, center, `fab-slot`), **Calendrier** (`CalendarDays`, `neutral-400`), **Réglages** (`Settings`, `neutral-400`). Min tap target 48×48. Active icon pop `scale(1.12)` 120ms.

### 7. FAB
- 56×56px, `radius-full`, bg `primary-600`, white `Plus` 26px, `shadow-fab`, center of bottom nav. Press `scale(.92)` 150ms. Opens the **quick-action sheet** (`.qas`) — NOT Add Expense directly (nav map §8.3). When offline + pending transactions, a small `warning-500`/`danger-500` dot badge appears top-right of the FAB.

### 8. Quick-action sheet (`.qas`, opened from FAB)
- Bottom sheet: `radius-lg` top corners, drag handle (40×4 `neutral-300`), `shadow-lg`, scrim `rgba(15,23,42,.45)`, z-index 40.
- Three large equal tiles in a row (each ≥72px tall, full-width-third, `radius-lg`, tap target 44+): **Dépense** (`ShoppingCart`/`MinusCircle`, `danger-500` accent), **Revenu** (`PlusCircle`, `success-500` accent), **Virement** (`ArrowLeftRight`, `primary-600` accent). Each tile carries the kind label (`button`) and a one-line hint (e.g. "Enregistrer une sortie", "Salaire, freelance…", "Entre deux comptes").
- A secondary row: **Récurrent** (`Repeat`, `neutral-600`) → Recurring management (15) or quick-confirm flow.
- Dismiss: swipe-down, scrim tap, Esc.

## Components & Elements

| Element | Type | Details |
|---|---|---|
| Top bar | Top bar (sticky) | 56px+safe-area; left `.acct-chip` (scope), right bell `.icon-btn`. No back chevron. |
| Account selector chip | `.acct-chip` button | `radius-full`, dot + name + chevron; opens account switcher sheet. Default "Tous les comptes". |
| Account switcher sheet | Bottom sheet | "Tous les comptes" + per-account rows (dot, name, balance) + "Gérer" → 13. |
| Aggregate balance hero | Hero card | `radius-xl`, `shadow-md`, gradient `primary-600→primary-500`; scope label + `.amount` + Revenus/Dépenses split. |
| Hero amount | Text (`.amount`, ~36px/700) | Tabular, white/`neutral-50`; count-up 300ms; e.g. "3 842,50 €". |
| Income/Expense split | Two-column text | `caption` label (translucent) + `.amount-md` value (white), "—" sign-prefixed, vertical-rule divider. |
| Per-account strip | Card (tight) | One `.row` per account: `.acct-icon` + name/recurring meta + balance. Tap → 06 scoped. |
| Account icon tile | `.acct-icon` | 32×32 `radius-full`, type-color tint + Lucide type icon 18px. |
| "À confirmer" section | Section + card | `.section-head` ("À confirmer" + `.stat-pill` count) + `.recur` rows. |
| Recurring row | `.recur` | `.cat` icon + name/"Récurrent · <account>" + `.amt-out` + `.confirm-btn`. |
| Confirm button | `.confirm-btn` | Pending "Pris" (`primary-600`) → confirmed "Fait" (`success-50`/`success-600`). 44px hit. |
| Direction badge | `.dir` | `.out` Dépense (`danger`), `.in` Revenu (`success`), `.trf` Virement (`primary`). |
| Mouvements récents | Section + card | "Mouvements récents" + "Tout voir" → 04; `.row` per movement with `.dir` + amount. |
| Movement row | `.row` | `.cat` + name/`.dir`/meta + `.r-amt` (`.amt-out`/`.amt-in`/`.amt-trf`). Tap → edit. |
| Bottom nav | Bottom navigation | 5 cols (Accueil/Stats/FAB/Calendrier/Réglages). |
| FAB | FAB | 56×56 `radius-full` `primary-600` `Plus` `shadow-fab`; opens `.qas`. |
| Quick-action sheet | `.qas` bottom sheet | Dépense / Revenu / Virement (+ Récurrent). |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `scope` | enum | `all` | `all` \| `<accountId>`; drives every aggregate. Deep-link `?account=`. |
| `accounts[]` | array | `[{id, name, type, color, icon, balance, pendingRecurringCount}]` | ≥0 items; ordered by user order. |
| `aggregateBalance` | number (decimal) | `3842.50` | Σ of account balances in scope; ≥0 in V1. |
| `accountCount` | integer | `3` | ≥0; shown in scope label when `scope=all`. |
| `monthIncome` | number | `2150.00` | Σ income this month in scope; ≥0. |
| `monthExpense` | number | `1240.00` | Σ expense this month in scope; ≥0. |
| `monthLabel` | string | `juin 2026` | Derived; fr-FR. |
| `pendingRecurring[]` | array | `[{id, name, categoryId, account, amount, dueDate, state}]` | `state ∈ {expected, confirmed}`; sorted by dueDate asc; ≤3 shown. |
| `recentMovements[]` | array | `[{id, kind, name, categoryId, accountId, amount, dir, time}]` | `kind ∈ {expense, income, transfer}`; `dir ∈ {in,out,trf}`; ≤5; sorted by `time` desc. |
| `isOffline` | boolean | `false` | Drives FAB pending badge. |
| `pendingSyncCount` | integer | `2` | Drives badge count/visibility. |

## States
- **Empty state (no account exists yet / first launch with no data):**
  - Top-bar chip reads "Tous les comptes" but is **disabled** (no chevron action) until ≥1 account exists.
  - Hero shows **"0,00 €"** in `neutral-50` at reduced opacity; scope label "SOLDE TOTAL · 0 COMPTE"; income/expense split reads "+0 €" / "−0 €" (translucent).
  - Per-account strip is **hidden**; replaced by a centered prompt card (`radius-lg`, `shadow-sm`): a `Wallet`/`Building2` icon (32px, `neutral-300`), `.h3` "Ajoutez votre premier compte", `body-sm` `neutral-500` "Pour commencer à suivre vos finances.", a Primary button "Créer un compte" → Accounts management (13). This is the **primary empty-state CTA**.
  - "À confirmer" and "Mouvements récents" sections are **hidden**; in their place a single `caption` helper `neutral-400`: "Vos récurrents et mouvements apparaîtront ici."
  - FAB still present and opens the quick-action sheet, but Dépense/Revenu are disabled with a tooltip-style caption "Créez d'abord un compte" until an account exists.
- **Loading state:**
  - On first paint / pull-to-refresh: skeleton placeholders. Hero amount = `neutral-200` `radius-md` bar (~200×40). Income/expense values = small `neutral-200` bars. Account strip = 3 skeleton `.row`s (32px circle + two bars + right bar). Recurring/recent cards = 2–3 skeleton rows each. Skeletons use a subtle opacity pulse 1.0↔0.6, 1.2s loop (static `neutral-100` under reduced-motion).
  - Pull-to-refresh shows a `primary-500` 24px spinner descending from the top bar during re-sync.
- **Error state:**
  - The Dashboard is offline-native and reads from the local store, so hard errors are rare. If the local store is unreadable (corruption/permission), show a full-screen centered error block: `danger-500` `AlertTriangle` icon (40px), `h2` "Impossible de charger vos données", `body-sm` `neutral-500` "Essayez de fermer et rouvrir l'application.", a Primary "Réessayer" button re-running the query. No partial/crashed UI.
  - If a specific account fails to load but others are fine, that account's row shows "—" balance + `caption` `danger-600` "Solde indisponible" with a retry tap; the rest of the screen renders normally.
- **Populated state (normal):**
  - Chip "Tous les comptes" with gradient dot; hero "3 842,50 €" / "SOLDE TOTAL · 3 COMPTES" / "+2 150 €" / "−1 240 €"; three account rows ("Compte courant 2 190,30 € · 2 récurrents à confirmer", "Épargne 1 540,00 €", "Espèces 112,20 €"); "À confirmer" with 2 échéances (Loyer −850 € Pris, Netflix −13,49 € Fait); "Mouvements récents" with Carrefour (Dépense, −28,90 €), Salaire juin (Revenu, +2 150 €), Virement → Épargne (Virement, −200 €). FAB present.

## Interactions & Micro-animations
- **Account chip → switcher sheet:** sheet slides up 16px + fade (200ms standard ease); selecting an account cross-fades the Dashboard's data in place (hero/strip/sections update with a 150ms opacity fade; amounts optionally count-up 300ms). Selecting the active scope is a no-op (sheet dismisses).
- **FAB tap → quick-action sheet:** FAB `scale(.92)` 150ms; `.qas` slides up + scrim fades (`cubic-bezier(.3,.0,.0,1)` 280ms emphasized). Selecting a tile morphs/slides into the target modal/sheet. FAB hidden while sheet open.
- **Confirm recurring (Pris):** `.confirm-btn` `scale(.98)` 120ms; row's amount crosses out / fades slightly; button morphs `primary-600` → `success-50`/`success-600`, label "Pris"→"Fait", `Check` animates in. The movement appears at the top of "Mouvements récents" with a FLIP insert animation. `success-600` toast slides up (4s). Recount the "À confirmer" `.stat-pill` and the account row's recurring meta.
- **Recent movement row tap:** `scale(.98)` 120ms; push to the relevant edit screen (translateY 16px + opacity).
- **Per-account row tap:** push to Monthly Overview (06) scoped to that account.
- **Hero tap / "Tout voir":** push transitions as above.
- **Pull down:** `primary-500` spinner; hero and lists re-query (near-instant locally); amounts count-up 300ms.
- **Long-press row:** quick-actions sheet ("Modifier", "Dupliplier", "Supprimer" `danger-600`).
- **Bell (if shipped):** sheet slide-up; lists pending recurring with "Confirmer" shortcuts.
- **Reduced motion (`prefers-reduced-motion: reduce`):** disable count-up, FLIP, scale pops, sheet-follow; opacity-only fades ≤150ms; sheet snaps on release.

## Accessibility Notes
- **Focus order:** Account chip → Bell (if present) → Hero (focusable group, scope label + balance) → Income value → Expense value → Account rows (in order) → "À confirmer" header/"Tout voir" → `.recur` rows (confirm buttons) → "Mouvements récents" header/"Tout voir" → Movement rows → Bottom nav (Accueil, Stats, FAB, Calendrier, Réglages).
- **Screen reader (amounts):** hero wrapped `aria-label` reading the full value, e.g. "Solde total, 3 comptes : trois mille huit cent quarante-deux euros cinquante". Income/expense: "Revenus du mois : plus deux mille cent cinquante euros"; "Dépenses du mois : moins mille deux cent quarante euros". Tabular figures are visual only. 🔴 confirm spoken form (friendly vs literal digits).
- **Account chip:** `aria-haspopup="dialog"`, `aria-expanded`, `aria-label="Sélectionner le compte, actuellement : tous les comptes"`. The switcher sheet uses `role="listbox"`/radiogroup semantics; selected account has `aria-selected`/`aria-checked`.
- **`.dir` badges:** text label always present ("Dépense"/"Revenu"/"Virement"); color is reinforcement only — never the sole signal. Movement amount sign (+/−) also reinforces.
- **`.confirm-btn`:** `aria-label="Confirmer l'échéance Loyer, moins huit cent cinquante euros"`; when done, `aria-pressed`/`aria-disabled` reflecting confirmed state; the morph to "Fait" is announced via `aria-live="polite"` region or a status update.
- **Icons:** `.acct-icon`/`.cat` tiles are decorative (`aria-hidden`); meaning conveyed by adjacent text. FAB `aria-label="Ajouter"`; bell `aria-label="Notifications"`.
- **Tap targets:** every interactive element ≥44×44 (chip 32 visual → padded; confirm-btn 32 visual → padded; rows 44+ tall; nav 48; FAB 56; sheet tiles 72+).
- **Contrast:** white text on `primary-600→primary-500` gradient verified ≥4.5:1 for the hero values; `rgba(255,255,255,.8)` captions verified for `.label`/`.caption` sizes on the gradient. `neutral-500` secondary on `neutral-50`/`neutral-900` ≥4.5:1.
- **Reduced motion:** as above.
- **Keyboard:** Tab/Enter operable throughout; Esc closes any open sheet; pull-to-refresh and long-press have button equivalents (switcher "Actualiser" affordance / row tap → edit).

## Notes / Open Questions
- 🔴 **No-account empty state** — the spec defines a "Créer un compte" CTA replacing the account strip, with FAB quick-actions disabled until an account exists. Confirm this gating is desired vs. allowing expense entry that auto-creates a default "Compte courant".
- 🔴 **Bell / notifications icon** — the mock shows a bell in the top-right. Confirm whether it ships in v1 and what it surfaces (recurring due reminders only, or also budget/overdraft alerts). If dropped, the recurring count is already surfaced via the "À confirmer" pill and account-row meta.
- 🔴 **Hero amount size** — the mock renders ~36px (between `amount-lg` 28 and `display-amount` 40). Decide whether to lock a new token (e.g. `amount-xl` 36px) or normalize to `display-amount` 40px. Add the token to the design system rather than an ad-hoc size.
- 🔴 **Transfer amount direction in recent list** — shown from the source account's perspective ("−200 €"). In aggregate scope a transfer is internal (excluded from income/expense), so the sign is informational only. Confirm whether aggregate-scope transfer rows should show a neutral "±0" or the source-side "−200 €" (mock uses −200 €).
- 🔴 **Negative balances** — inherited from design system §13.8.1: V1 forbids negatives. Confirm; if `espèces`/`courant` may go slightly negative, the per-account balance and hero need a `danger-600` treatment.
- 🔴 **"À confirmer" cap & overflow** — Dashboard shows ≤3 pending occurrences; "Tout voir" → Recurring (15). Confirm the cap (3 vs 5) and whether confirmed-today items linger briefly before clearing.
- 🔴 **Rollover visibility on Dashboard** — design system §13.5 shows the rollover badge on Monthly Overview. Confirm whether the Dashboard hero should surface a "+127 € reportés de mai" line when the month was just closed (recommend: no — keep the hero clean; surface in 06 only).
- 🔴 **Spoken-amount form (fr)** — friendly ("trois mille…") vs literal digits. Recommend friendly where locale permits.
- 🔴 **Pending-sync badge semantics** — dot vs count, `warning-500` (pending) vs `danger-500` (failed). Aligns with Offline Indicator (11).
- **Pull-to-refresh** — near-instant locally; spinner is mostly reassurance + manual re-sync after reconnect. Keep.
