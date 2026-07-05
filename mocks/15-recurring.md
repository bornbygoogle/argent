# Recurring Management

## Purpose

Manage **expected-then-confirmed** recurring entries (§13.4): scheduled amounts on an account that are **not** auto-deducted — each period exposes a pending occurrence the user **confirms ("Pris / Fait")** when the money actually moves; confirming creates a real `expense` or `income` transaction for that period. Shows a summary (à confirmer / confirmés totals), a segmented scope (À confirmer / Tous / Historique), recurrings grouped by account, and each row exposes an **editable amount** (forward-only; history immutable), a confirm button, and a cadence label. Create new recurrings, delete them, and edit the forward amount from here. Pushed screen (no bottom nav).

## Navigation

- **Entry points:** Settings (09) → "Récurrents"; Dashboard "Récurrents à confirmer" section → "Tout voir"; Quick-action sheet (17) → "Gérer les récurrents"; deep link `/recurring`.
- **Chrome:** top bar — back chevron, title "Récurrents", right "+ Nouveau" secondary button. No bottom nav.
- **Exit:** back / swipe-right → origin.
- **Confirm / edit / delete** all happen inline or via sheets (no navigation).

## Layout Description

1. **Top bar.** `←` / "Récurrents" / "+ Nouveau".
2. **Summary card** (`.card .tight .row-between`): left `.caption` "À confirmer ce mois" + `.amount-md` in `warning-600` ("4 · 1 038,49 €"); vertical 1px `neutral-100` divider; right `.caption` "Déjà confirmés" + `.amount-md` in `success-600` ("2 · 340 €"). Counts + totals.
3. **Segmented control** (`.seg`): **À confirmer** (active) / Tous / Historique.
4. **Per-account groups.** A `.section-head` with `.label` = account name ("Compte courant", "Espèces", …), then a `.card .tight` containing `.recur` rows.
5. **`.recur` row** (each recurring):
   - `.cat` icon tile (type/category color at 15% alpha, 20px Lucide icon).
   - `.r-main`: `.r-title` (label) + `.r-sub` (cadence + meta, e.g. "Mensuel · échéance 1er"; for salary "Mensuel · clôture le mois"; for an edited amount "Mensuel · 13,49 € → **modifié**" in `primary-600`).
   - Amount `.amount-md` (`.amt-out` `danger-600` for expenses with `−`; `.amt-in` `success-600` for income with `+`). **Tappable to edit.**
   - `.confirm-btn`: when pending = `primary-600` (label "Pris", check icon); when confirmed = `.done` `success-600`/`success-50` (label "Fait", check icon).
6. **Forward-only note** at the bottom of the list (`.caption`, centered): "Le montant modifié s'applique à partir de maintenant sans modifier l'historique."

## Components & Elements

| Element | Type | Details |
|---|---|---|
| Summary card | Card | Two-column totals (pending warning / confirmed success). `role="status"` updated as rows confirm. |
| Segmented `.seg` | Segmented control | 3 options. Active = `primary-600` underline/fill. `role="tablist"`. |
| Account group head | Section header | `.label` account name. |
| `.recur` row | List row | `radius-lg`, tappable target on the amount and on the confirm button separately. Whole row tap opens the Recurring detail/edit sheet. |
| `.cat` icon tile | Icon | 15%-tint bg of category color; Lucide outline. 32×32. |
| Amount (editable) | Tappable text | `.amount-md`. Tap → inline editor or small sheet to change forward amount. Sign/color by direction. |
| Cadence label | Text | `.r-sub`: "Mensuel · échéance 1er" / "Hebdo" / "Annuel". Descriptive (§13.8.3). |
| `.confirm-btn` | Button | Pending: `primary-600` bg, white "Pris" + check. Confirmed (`.done`): `success-50` bg, `success-700` "Fait" + check. Min 44px hit. |
| "+ Nouveau" | Secondary button | Opens New Recurring sheet. |
| Recurring edit sheet | Bottom sheet | Edit label / amount (forward) / cadence / direction; delete. |
| New Recurring sheet | Bottom sheet | Blank form (see Data Fields). |
| Forward-only note | Caption | Static explainer. |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `account` | ref | `acc_courant` | Required. |
| `direction` | enum | `expense` | `expense` or `income`. Drives sign, `.dir`, and transaction kind on confirm. |
| `label` | string | "Loyer" | Required, ≤40 chars. |
| `amount` | number (€) | `850.00` | Required, `> 0`, ≤2 decimals, max 9 999 999,99. Editable forward-only. |
| `cadence` | enum | `mensuel` | `mensuel` / `hebdo` / `annuel`. Descriptive label only (§13.8.3). |
| `cadenceMeta` | string | "échéance 1er" | Optional free text appended to cadence label. |
| `icon` / `color` | Lucide / hex | `Home` / `#EF4444` | Preset; editable. |
| `state` | enum | `expected` | `expected` (warning) / `confirmed` (success). Per current period. |
| **Confirmed transaction (created on confirm)** | transaction | — | `kind` = `expense` or `income`, amount = current (possibly edited) amount, account, date = confirm day, category = recurring's category (expenses) / income type (incomes). |
| `history[]` | array | `[{month:'2026-05', amount:13.99}, …]` | Immutable record of past confirmed occurrences with their amounts. Past amounts never change when the forward amount is edited. |

## States

- **Empty state:** Summary shows "0 · 0,00 €" both columns. Centered illustration (Lucide `Repeat`, 48px, `neutral-300`) + "Aucun récurrent. Ajoutez-en un pour suivre vos charges et revenus réguliers." + Primary "Nouveau récurrent". Segmented hidden.
- **Loading state:** Skeleton summary card + skeleton rows (<300ms, local store).
- **Error state:** If confirm fails (e.g. write error), toast "Échec de la confirmation" (`danger-600`, 6s, retry action); button reverts to pending.
- **Populated state:** As mock — À confirmer 4 · 1 038,49 €; Confirmés 2 · 340 €. Courant group: Loyer −850 € (Pris), Netflix −13,49 € (Pris, "modifié"), Salaire +2 150 € (Pris). Espèces group: Forfait mobile −9,99 € (Fait). Forward-only note visible.
- **Pending row:** `.confirm-btn` `primary-600` "Pris".
- **Confirmed row:** `.confirm-btn` `.done` `success` "Fait"; row text `neutral-500` (dimmed); amount stays visible.
- **Edited-amount row:** `.r-sub` shows "13,49 € → **modifié**" (`primary-600`); tooltip/`aria-describedby` "S'applique à partir de maintenant."
- **History tab:** list of past confirmed occurrences grouped by month, read-only, with their recorded amounts (which may differ from the current forward amount).
- **Salary recurring confirmed:** triggers the same rollover dialog as Add Income (14) — confirming a `Salaire`-direction recurring also closes the month for that account.

## Interactions & Micro-animations

- **Confirm ("Pris")** — tap `.confirm-btn`:
  1. Creates a real transaction (`expense`/`income`) at the current (possibly edited) amount, dated today, on the recurring's account.
  2. Appends to `history[]` (immutable) with this period's amount.
  3. Row animates pending→confirmed: button morphs `primary-600`→`success` with a check pop (`scale(1.12)` 120ms), row text dims, summary totals animate (count-up 300ms, FLIP for the delta).
  4. If direction = `income` and label/type resolves to salary-equivalent → same rollover dialog as Add Income.
  5. Toast "Confirmé" (`success-600`, 3s).
- **Edit amount (forward-only)** — tap the amount: inline numeric editor (or small sheet) with a clear caption "Nouveau montant à partir de maintenant". On save:
  - Updates `amount` (the forward value).
  - Does **not** touch any entry in `history[]`; past confirmed occurrences keep their recorded amount.
  - `.r-sub` gains the "→ modifié" badge.
  - If the current period is still `expected`, the pending occurrence uses the new amount; if already `confirmed` this period, the change applies from the **next** period.
- **New recurring ("+ Nouveau")** — sheet: account picker, direction toggle (Dépense/Revenu → `.dir`), label, amount, cadence (mensuel/hebdo/annuel), icon+color. Save → row inserts with FLIP, defaults to `expected`.
- **Delete recurring** — swipe-left on row (or delete in edit sheet) → center modal "Supprimer ce récurrent ? Les occurrences déjà confirmées restent dans l'historique." → confirm removes the recurring (scheduled) but keeps past transactions.
- **Segmented switch** — instant filter with opacity fade; counts in summary stay global.
- Pressed: `scale(.98)`, darken, 120ms. Confirm check pop respects `prefers-reduced-motion` (opacity only).

## Accessibility Notes

- `.confirm-btn` carries `aria-label`="Marquer <label> comme pris" / when done `aria-pressed="true"`.
- Amount editor announces "Nouveau montant, appliqué à partir de maintenant, l'historique n'est pas modifié."
- Segmented control is `role="tablist"`/`role="tab"`; arrow keys switch; active announced.
- Summary is `role="status"` `aria-live="polite"` so confirmations update the announced totals.
- Color never alone: direction conveyed by sign (`−`/`+`), icon, and label; state conveyed by button label ("Pris"/"Fait") + icon, not just color.
- All targets ≥44×44; swipe-to-delete has an equivalent delete action in the edit sheet (motor-impaired).
- `prefers-reduced-motion`: no count-up, no FLIP, no check pop (opacity only ≤150ms).

## Notes / Open Questions

- 🔴 **Cadence vs next-occurrence suggestion** (§13.8.3). Currently cadence is descriptive text only. Confirm whether the app should *suggest* the next pending occurrence date (e.g. surface "échéance 1er" and auto-show pending on that date). Recommend: descriptive + manual confirm; the row is always present in "À confirmer" for the current period regardless of exact date.
- 🔴 **Edit amount scope.** Confirm: editing applies from the current period if still `expected`, else from next period — specced above. Confirm exact UX (inline vs sheet).
- 🔴 **Confirming a salary-direction recurring → rollover.** Confirming the "Salaire" recurring is functionally identical to recording a Salaire income and must trigger the same rollover dialog (§13.5). Ensure parity with Add Income (14).
- 🔴 **History immutability guarantee.** Past `history[]` entries must be read-only even if the user edits label/amount/cadence. Confirm storage enforces this (append-only history).
- 🔴 **Soft vs hard delete.** Deleting a recurring removes future scheduling but keeps past confirmed transactions (specced). Confirm no cascade into transaction history.
- 🔴 **Group ordering** — recurrings grouped by account; within a group, order = by creation or user-defined? Recommend creation order with a future drag-to-reorder (parity with accounts).
- `.dir` badge component (§13.6) is available but the recurring row relies on sign + label for direction; `.dir` may be used in the New Recurring direction toggle.
