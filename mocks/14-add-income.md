# Add Income

## Purpose

Fullscreen modal for recording incoming money (`income` transaction, sign +, counts as income). Reached primarily from the Quick-action sheet "Revenu" tile and from the Accounts screen "Revenu" button. Carries an account picker, a live amount driven by a green numpad, an income-type chip row (`Salaire` / `Remboursement` / `Cadeau` / `Freelance` / `Vente` / `Autre`), a description, and a date. When `type === 'Salaire'`, a highlighted notice appears ("Enregistrer ce salaire clôture le mois et reporte le solde restant") and on Save triggers the **monthly rollover confirm dialog** (§13.5, §8.4).

Fullscreen because the numpad needs full height; mirrors the Add Expense (03) layout for muscle memory. Deep-linkable via `/income`.

## Navigation

- **Entry points:** Quick-action sheet → "Revenu"; Accounts (13) → "Revenu" button; deep link `/income` (`?account=<id>` optional).
- **Chrome:** top bar with "Annuler" (ghost, left), centered title "Nouvelle rentrée" (`h3`, 16px), "OK" primary button (right, disabled until valid). No bottom nav. FAB hidden while open.
- **Exit:** "Annuler" / swipe-down (limited — fullscreen) / Esc → if form dirty, confirm-discard sheet ("Abandonner les modifications ?"); else close. On valid "OK" → save → if `Salaire`, show rollover dialog → on confirm rollover → toast "Revenu enregistré" → close, returning to origin.
- **Default account:** last-used income account, or the currently-scoped account from the origin screen.

## Layout Description

1. **Top bar.** "Annuler" / "Nouvelle rentrée" / "OK".
2. **Account picker row** (`.card .tight`, `row-between`, `space-2` padding): `.body-sm` bold "Compte" + `.acct-chip` (type-colored dot + name + chevron). Tapping the chip opens the **Account switcher sheet** (selectable accounts only; archived excluded).
3. **Amount display** (centered). `.label` "Montant reçu"; below, a flex baseline row: `.amount` in **`success-600`** (green) + `.h2 .muted` "€". Starts at `0,00`. Updates live from the numpad. Tabular figures.
4. **Income-type chips** (`.chip-row`, horizontal scroll if overflow). `.label` "Type" above. Six chips. Selected state: `success-50` bg / `success-700` text / `success-500` outline (matches the income/green semantic; `Salaire` chip carries a small dollar/Lucide `Banknote` icon). Default selected = `Salaire`.
5. **Salary rollover notice** (conditionally rendered when `type === 'Salaire'`). `.card` with `primary-50` bg, `primary-100` border, `space-3` padding. Flex row: Lucide `RotateCcw`/`RefreshCw` icon (18px, `primary-600`) + block: `.body-sm` bold `primary-700` "Salaire = clôture du mois" + `.caption` `primary-700` "Enregistrer ce salaire va clôturer <mois courant> et reporter le solde restant sur <mois suivant>." Uses the account's month scope.
6. **Description + date card** (`.card .tight`, two rows separated by a `.divider`):
   - Row A: Lucide `Type`/`Text` icon + text `input` (transparent, no border) — placeholder "Description (ex. Salaire mensuel)". Prefilled when `Salaire` = "Salaire mensuel".
   - Row B: Lucide `Calendar` icon + "Aujourd'hui, 24 juin" (tappable → native date picker / sheet). Defaults to today.
7. **Numpad** (sticky to bottom safe area, `margin-top:auto`). 3×4 grid: `1–9`, `.`, `0`, backspace (`Delete` icon, `neutral-700`). Keys `.key` `radius-md`, `neutral-100` bg, press `neutral-200`, haptic on tap. No quick-amount row here (unlike Add Expense) to keep the surface calm; the chips above handle presets via income type.

## Components & Elements

| Element | Type | Details |
|---|---|---|
| Account chip | `.acct-chip` | Type-colored `.acct-dot` + name + chevron. Opens switcher sheet. Min 44px hit. |
| Amount display | Text | `.amount`, `success-600`, tabular. Centred. ARIA `aria-live="polite"` so SR reads the live amount. |
| Numpad key | Button | 3×4 grid, flex tiles, `h3` 28px+ numerals, `radius-md`, haptic on press. Backspace key transparent bg. |
| Income-type chip | `.chip` | `radius-full`/`sm`, `body-sm`. Selected → green semantic (`success-50`/`success-700`/`success-500` outline). Icon-optional. Min 44px hit. |
| Rollover notice | Card | Conditional. `primary-50` bg, `primary-100` border, icon + bold title + caption. `role="status"`. |
| Description input | Text field | Borderless inside card; focus ring on the card. Max 80 chars. |
| Date row | Picker row | Tappable; opens date sheet. Format localized "24 juin". |
| "Annuler" | Ghost button | Discards (with guard if dirty). |
| "OK" | Primary button | Disabled until `amount > 0` and an account is selected. |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `account` | ref (account id) | `acc_courant` | Required. Defaults to last-used. Archived not selectable. |
| `amount` | number (€) | `2150.00` | Required, `> 0`. Up to 2 decimals, max 9 999 999,99. "OK" disabled at 0. |
| `type` | enum | `Salaire` | Required. One of `Salaire`, `Remboursement`, `Cadeau`, `Freelance`, `Vente`, `Autre`. Default `Salaire`. |
| `description` | string | "Salaire mensuel" | Optional, ≤80 chars. Prefilled for `Salaire`. |
| `date` | ISO date | `2026-06-24` | Required. Default today. Cannot be a future date beyond current rollover period (warn if > today: future-dated income allowed but flagged). |
| **Rollover trigger (derived)** | boolean | `true` when `type==='Salaire'` | Drives the post-save dialog. |

## States

- **Empty state:** Amount `0,00`, "OK" disabled (`neutral-200`/`neutral-400`). `Salaire` pre-selected, description prefilled, notice visible, account = default.
- **Loading state:** "OK" shows spinner after tap; numpad disabled; prevents double-submit.
- **Error state:** If no account selected (e.g. user has zero accounts), the account chip shows "Aucun compte" in `danger-600` and the chip is disabled; a toast "Créez d'abord un compte" links to Accounts (13). "OK" disabled. Amount 0 → caption "Entrez un montant" below the amount in `danger-600`.
- **Populated state:** Account = Courant; amount **2 150,00 €** green; type = Salaire (green outline); notice "…va clôturer juin et reporter le solde restant sur juillet."; description "Salaire mensuel"; date "Aujourd'hui, 24 juin". "OK" enabled.
- **Non-salary state:** Notice hidden; e.g. type = Remboursement → just a normal income save, no rollover.
- **Rollover dialog state:** On "OK" with `Salaire` → center modal (see Interactions) over the dimmed modal. Confirm finalizes/closes the month and carries the balance forward; **Cancel still records the income** (the salary is real money and must persist) but leaves the month **open** — no rollover, no close (DECIDED, §13.5). The user may close/roll over later by recording salary again.
- **Future-date state:** If date > today, caption under date in `warning-600`: "Date future — le mois ne sera clôturé qu'à l'enregistrement." `Salaire` notice still appears.

## Interactions & Micro-animations

- **Amount entry** — numpad keystrokes append to the decimal amount; live update, no count-up on direct input; haptic light on each key.
- **Chip select** — tap to select; selected chip scales `.98` then settles; unselected sibling fades to default. Switching `type` to/from `Salaire` slides the notice in/out (height + opacity, 200ms standard ease).
- **"OK" / Save flow:**
  1. Validate (amount > 0, account set).
  2. Write the `income` transaction to the local store (offline-queued if offline).
  3. If `type === 'Salaire'`: open the **Rollover confirm dialog** (center modal, `radius-xl`, `shadow-lg`):
     - Title: "Clôturer le mois ?"
     - Body: "Enregistrer ce salaire clôture le mois de **<account name>** pour **<mois courant>** et reporte le solde restant (**+127 €** estimé) sur **<mois suivant>**. Les mois passés restent figés."
     - Buttons: "Annuler" (ghost) / "Clôturer et reporter" (`primary-600`).
     - On confirm: finalize current month for that account, compute carried-forward balance, mark month `closed`, surface a report badge on Monthly Overview ("+127 € reportés de <mois>").
     - On cancel: income is **saved but the month is left open** — no rollover, no close (DECIDED, §13.5). Rollover stays an explicit later action.
  4. Toast "Revenu enregistré" (`success-600`, 4s). Modal slides down + fades (200ms).
- **Account switch** — tapping `.acct-chip` opens the switcher sheet; selecting updates the chip with a 120ms cross-fade and re-evaluates the salary notice's month text for that account.
- **Dirty-form guard** — back/swipe/Esc with `amount > 0` or edited fields → "Abandonner les modifications ?" sheet.
- Pressed: `scale(.98)`, darken, 120ms.

## Accessibility Notes

- Amount `aria-live="polite"` announces the running total as the user types.
- Each numpad key: `aria-label` (digits, "point", "effacer"); 44×44 min; operable with keyboard (digit row maps to physical keys).
- Chips are `role="radiogroup"`, chips `role="radio"`; arrow-key cycling; selected state announced.
- Notice is `role="status"` so it is read when it appears.
- "OK" disabled state is communicated to AT (`aria-disabled="true"`), and the reason (missing amount/account) is in an `aria-describedby` caption.
- Focus trap inside the modal; first focus = amount display (or account chip if unset). Esc closes (with dirty guard).
- Respects `prefers-reduced-motion`: no chip scale, notice appears via opacity-only fade ≤150ms.

## Notes / Open Questions

- ✅ **Cancel on rollover dialog — DECIDED (§13.5).** Tapping "Annuler" on the rollover dialog **keeps the salary income** (real money, must persist) but **leaves the month open** — no rollover, no close. The user can close/roll over later by recording salary again. Rollover is a separate explicit action, never silently tied to the save.
- 🔴 **Salary on multiple accounts.** Per §13.8.5 / §8.4 each account rolls over independently on its own salary entry. This screen operates per-account; recording salary on account A rolls over only A. Confirm and ensure the notice names the specific account.
- 🔴 **Rollover estimate shown pre-save** — the dialog shows a computed "remaining balance to carry forward". Confirm the exact formula: current live balance − any already-confirmed recurring expenses for the period? Recommend: live balance at save time, carried forward as-is.
- 🔴 **Future-dated salary & rollover timing** — §13.8.4 asks immediate vs dialog; spec'd as dialog on Save. For a future-dated salary, confirm whether rollover fires immediately or on the dated month-end. Recommend: immediate on Save (dialog), since the user is explicitly closing the month.
- 🔴 **`Autre` type** — purely descriptive; no special behavior.
- Numpad intentionally omits a quick-amount row (e.g. `+50`); income amounts are usually exact. If fast presets are wanted, add a top numpad row mirroring Add Expense — flagged, not specced.
- Income type list is managed separately from expense categories (§13.3); editing that list lives in Settings, not here.
