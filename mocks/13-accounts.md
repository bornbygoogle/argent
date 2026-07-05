# Accounts Management

## Purpose

Central hub for managing every account in the app (`courant`, `épargne`, `espèces`, `autre`). Surfaces the **net-worth hero** (sum of all account balances) and a reorderable list of accounts showing live balance plus a contextual status (budget %, monthly delta, or recurring-active marker). From here the user can add, edit, archive, delete, and reorder accounts, and jump straight into the two most common cross-account actions: a **Virement** (transfer) or a **Revenu** (income). Pushed screen (no bottom nav); reached from Settings, the top-bar account chip → switcher sheet → "Gérer", and from `/accounts`.

Single-currency (€) V1. Account model is fully defined in `00-design-system.md` §13.1 and `00-navigation-map.md` §8.

## Navigation

- **Entry points:**
  - Settings (09) → "Comptes" row (pushed).
  - Dashboard / Stats / Calendar top-bar `.acct-chip` → "Tous les comptes" switcher sheet → "Gérer" (pushed).
  - Deep link: `/accounts` (and `/accounts/:id` opens the edit sheet for that account).
- **Chrome:** top bar with back chevron (`←`), title "Comptes", right action "+ Ajouter" (`.btn .btn-secondary .btn-sm`). No bottom nav (pushed screen). Swipe-right edge back.
- **Exit:** back chevron / swipe-right returns to origin (Settings or the screen that opened the switcher). Selecting an account opens the **Edit Account** sheet (not navigation — overlay).
- **Scope:** does not carry an `?account=` param (it manages all of them); all other account-aware screens do.

## Layout Description

1. **Top bar (sticky, 56px + safe-area top).** Left: back chevron (44×44 hit). Center: title "Comptes" (`h3`). Right: "+ Ajouter" secondary button.
2. **Net-worth hero card.** Full-width, `radius-xl`, `shadow-md`, accent gradient `primary-600`→`primary-500`. Contents:
   - Eyebrow `.label`: "Patrimoine total" (white at 80% opacity).
   - `.amount` display-amount (34–40px, tabular, white): **3 842,50 €**.
   - `.caption`: "3 comptes · devise €" (white at 85%).
3. **Section head** (`.section-head`): `.label` "Mes comptes" + `.caption` "Maintenir pour réordonner".
4. **Account cards** (vertical stack, `space-3` gap). Each card (`radius-lg`, `shadow-sm`, `space-4` padding):
   - Row 1: drag handle (6-dot Lucide `GripVertical`, 18px, `neutral-300`) · type-colored `.acct-icon` (rounded square, 12% tint of type color) · `.r-title` name · `.r-sub` ("Type · sous-titre").
   - Row 2 (indented under the icon, `padding-left:30px`): left = live balance `.amount-md` 20px tabular; right = contextual status (see below).
5. **Quick-action grid** (2 columns, `space-3` gap, full-width, min 48px height): "Virement" + "Revenu" secondary buttons with leading icon.
6. Padding `space-4` gutter; `padding-bottom:24px` clear of safe area.

**Account card — contextual status (right of balance), pick first that applies:**
- `courant` with a budget set & at risk → `.stat-pill` `danger-50`/`danger-600`: "Budget à 92%".
- `épargne` / positive monthly delta → `.stat-pill` `success-50`/`success-600`: "+200 € ce mois".
- Has active recurring → text in `.r-sub`: "⬤ récurrent actif".
- Otherwise → chevron (`›`) indicating tappable-to-edit.

## Components & Elements

| Element | Type | Details |
|---|---|---|
| Net-worth hero | Card | Accent gradient bg, white text, `radius-xl`, `shadow-md`. Amount in `display-amount`, tabular (`tnum`). |
| Account card | Card | `radius-lg`, `shadow-sm`. Whole card tappable to open Edit Account sheet (hit target excludes the drag handle). Min height 72px. |
| Drag handle | Icon button | Lucide `GripVertical`, 18px visual, 44×44 hit (`neutral-300`). Visible on hover/focus; long-press to drag on touch. ARIA: `aria-label="Réordonner <name>"`, `aria-roledescription="poignée"`. |
| Up/Down buttons | Icon button | A11y-only affordance revealed in "Réordonner" mode: `ChevronUp` / `ChevronDown`, 44×44 hit, `neutral-500`. Moves account one position; FLIP animates the swap. |
| Account icon | Icon tile | `.acct-icon`, 32×32, `radius-md`, bg = type color at 12% alpha, stroke = type color. Lucide icon per type (courant `CreditCard`, épargne `PiggyBank`, espèces `Wallet`, autre `Wallet`/`CircleDollarSign`). |
| Live balance | Text | `.amount-md` 20px tabular. Color `neutral-900` when ≥ 0; **negative allowed** (§13.1) → `danger-600` with a leading `−`. |
| Status pill | Badge | `.stat-pill`, `radius-full`, `body-sm`, padded `space-1`×`space-2`. Color set by semantic state. |
| "+ Ajouter" | Secondary button | Top-bar right. Opens Add Account sheet. |
| "Virement" | Secondary button | Opens Transfer sheet (16) with `from` pre-filled to first `courant`. |
| "Revenu" | Secondary button | Opens Add Income (14) with account = last used or first account. |
| Edit Account sheet | Bottom sheet | Triggered by tapping a card (not the handle). See below. |
| Add Account sheet | Bottom sheet | Same template as Edit, empty fields. |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `name` | string | "Compte courant" | Required, 1–40 chars, unique (case-insensitive). Error: "Ce nom existe déjà." |
| `type` | enum | `courant` | Required. One of `courant`, `épargne`, `espèces`, `autre`. Defaults `courant`. |
| `color` | swatch (hex) | `#4F46E5` | Preset swatch (§2 category swatches); defaults by type (§13.1). |
| `icon` | Lucide name | `CreditCard` | Defaults by type; user may change from icon subset. |
| `openingBalance` | number (€) | `500.00` | Decimal; **may be negative** (e.g. an account opened in overdraft — §13.1). Range ±9 999 999,99. |
| `createdAt` | ISO date | `2026-01-04` | Set automatically, immutable. |
| `archived` | boolean | `false` | Soft-delete flag. Archived accounts excluded from net-worth and selectors but retain transactions. |
| **Live balance (derived)** | number | `2 190,30` | `openingBalance + Σ income − Σ expense + Σ transfers-in − Σ transfers-out`. Read-only. |
| **Net worth (derived)** | number | `3 842,50` | Σ of all non-archived account live balances. Read-only. |
| `order` | integer | `0` | Display order; reassigned on drag/reorder. |

## States

- **Empty state:** Hero still shows "Patrimoine total" = `0,00 €`, caption "0 compte · devise €". List area replaced by a centered illustration (Lucide `Wallet`, 48px, `neutral-300`) + `.body-sm` "Ajoutez votre premier compte pour commencer." + Primary button "Ajouter un compte". Quick-action grid is hidden (nothing to transfer/earn into).
- **Loading state:** Hero amount shows a neutral skeleton bar; cards show skeleton lines (`neutral-100`). Balance math is local/instant; this state is rare (first launch DB hydration, <300ms).
- **Error state:** If a derived balance fails to compute (corrupt store), the offending card shows balance as "—" in `danger-600` + `.caption` "Solde indisponible"; other cards unaffected. A toast "Impossible de charger un compte" appears (danger, 6s).
- **Populated state:** Hero 3 842,50 € / "3 comptes · devise €"; three cards as in mock (Courant 2 190,30 € / Budget à 92%; Épargne 1 540,00 € / +200 € ce mois; Espèces 112,20 €). Quick-action grid visible.
- **Single-account state:** Hero shows the one balance; "Maintenir pour réordonner" caption hidden; reorder disabled.
- **Drag-in-progress:** Lifted card gains `shadow-lg` + `scale(1.02)`; placeholder row shows where it will drop; others dim to 60%.
- **Archived-visible mode:** Toggled from a "Voir archivés" ghost link at the bottom. Archived cards render at 50% opacity with "Archivé" pill and Restore/Delete actions.

## Interactions & Micro-animations

- **Tap account card** → Edit Account sheet slides up (`radius-lg` top, `shadow-lg`, 16px translateY + fade, standard ease 200ms). Sheet populated with that account's fields.
- **Long-press / drag handle** → enters reorder mode: handle becomes the grab cursor; FLIP animates sibling reflow. Drop commits `order` immediately (debounced 400ms). Haptic light on drop.
- **Up/Down buttons** (a11y) → move account one slot; same FLIP animation.
- **"+ Ajouter"** → Add Account sheet (same template, blank, focus on `name`).
- **Quick-action buttons** → morph/slide into Transfer sheet or Income modal (emphasized ease 280ms).
- **Balance count-up** on first load of the hero (300ms), disabled under `prefers-reduced-motion`.
- **Delete** → center modal confirm (destructive); card animates out (height + opacity, FLIP) on confirm.
- Pressed states: `scale(.98)`, darken one step, 120ms.

## Accessibility Notes

- Drag handle + up/down buttons guarantee reorder works without drag (keyboard & switch-control). Up/down announce "Déplacé en position N sur M".
- Every interactive element ≥44×44 hit; icon buttons carry `aria-label`.
- Net-worth hero: amount is `role="heading" aria-level="1"` for the screen; card titles `aria-level="2"`.
- Color is never the sole signal: budget pill "Budget à 92%" includes the percentage text; type is conveyed by the icon + label, not just the swatch.
- Statuses exposed via `aria-live="polite"` so balance/percentage updates after a transfer are announced.
- Focus order: back chevron → "+ Ajouter" → hero → card 1 … card N → quick actions. Focus trapped in any open sheet.
- Respects `prefers-reduced-motion`: no count-up, no FLIP (rows snap), opacity-only fades ≤150ms.

## Notes / Open Questions

- ✅ **Delete vs archive vs reassign — DECIDED (§13.1 lifecycle).** The Edit Account sheet's destructive action offers **two non-destructive-first steps**:
  1. **Archiver** (default, soft delete `archived=true`): excluded from net-worth, switcher, and transfer/income pickers, but **keeps transactions & history**. Reversible via "Restaurer" (from the archived list).
  2. **Supprimer définitivement** (only reachable from the archived list): if the account has transactions → a **reassign sheet** forces choosing a target account (transactions move there) before removal; if zero transactions → removed outright. Past monthly rollovers stay immutable either way.
  The Edit Account sheet primary destructive button reads "Archiver le compte"; "Supprimer définitivement" is a secondary Ghost-Danger action that, when the account has transactions, opens the reassign sheet ("Déplacer les N transactions vers…" → picker of other non-archived accounts → "Supprimer le compte").
- 🔴 **Edit account opening balance retroactivity.** Changing `openingBalance` recomputes the live balance; does it invalidate past monthly rollover figures? Recommend: opening balance is editable but only affects the *current* live balance; past months remain immutable (rollover already finalized). Confirm.
- 🔴 **Net-worth for archived accounts.** Confirmed excluded; ensure switcher/transfer pickers also exclude archived unless "Voir archivés" is on.
- 🔴 **Rename cascade.** Renaming an account updates every `.acct-chip` and transaction `account` label instantly (denormalized name) — confirm no referential break.
- 🔴 **Reorder persistence across devices** — sync not in V1 (offline-first); `order` is local-only. Confirm.
- "Tout" in transfer is intentionally absent here; it lives on the Transfer sheet.
- Type color mapping is fixed (§13.1) but the user may override `color` with a preset swatch; the icon tint follows `color`, not the default type color, once overridden.
