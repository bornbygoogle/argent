# Transfer

## Purpose

Bottom sheet to record an **internal move** of money between two of the user's own accounts (`transfer`, §13.2). A transfer is explicitly **NOT** income and **NOT** expense: it is excluded from category totals and the donut, but **included** in account balances. It creates **two linked legs** — a `−` on the from-account and a `+` on the to-account. Reached from the Quick-action sheet "Virement" tile and from the Accounts screen "Virement" button. Bottom sheet (not fullscreen) because it's a focused, quick action.

## Navigation

- **Entry points:** Quick-action sheet (17) → "Virement"; Accounts (13) → "Virement" (pre-fills `from` = first `courant`); deep link `/transfer` (`?from=<id>&to=<id>` optional).
- **Chrome:** sheet header — `h2` "Virement" + close `✕` icon button (right). Drag handle (40×4px `neutral-300`) at top. Scrim behind. No bottom nav (overlay). FAB hidden.
- **Exit:** "✕" / scrim tap / swipe-down → if form dirty (amount > 0 or accounts differ from defaults), confirm-discard sheet; else close. "Effectuer le virement" → save → toast → close.
- **Default `from`:** last-used `courant`, or the currently-scoped account, or the first non-archived account. `to` defaults to a *different* account (next in order).

## Layout Description

1. **Sheet header.** Drag handle, then a row: `h2` "Virement" (18px) + `✕` close button.
2. **From picker.** `.label` "De" + a full-width `.card .tight` button: `.acct-icon` (type color) + `.r-title` account name + `.r-sub` "Dispo <balance>" + chevron. Tapping opens the account picker (excludes the current `to`).
3. **Swap button.** Centered circular button (36px, `radius-full`), `primary-50` bg, `primary-600` icon (Lucide `ArrowLeftRight`), 3px `neutral-50` border (sits over the gap between the two cards, `margin:-4px 0`). Swaps `from` ↔ `to`.
4. **To picker.** `.label` "Vers" + same card layout, `.r-sub` "Solde <balance>". Picker excludes the current `from`.
5. **Amount.** Centered: `.label` "Montant" + flex baseline row `.amount` (34px) + `.h2 .muted` "€". Below: `.chip-row` centered quick chips: **+50 · +100 · +200 · Tout**. "Tout" sets amount = full `from` balance.
6. **Internal-move note.** `.caption` centered: "Mouvement interne — ni revenu ni dépense."
7. **Primary action.** Full-width `primary-600` button "Effectuer le virement" (min 48px). Disabled until valid.
8. Below the primary button (optional): a note + date row ("Aujourd'hui, 24 juin", tappable → date sheet) — kept compact; date defaults today.

## Components & Elements

| Element | Type | Details |
|---|---|---|
| Drag handle | Grip | 40×4px `neutral-300`; swipe-down to dismiss (release past 40% → close). |
| Close `✕` | Icon button | 44×44 hit. Closes (with dirty guard). |
| From/To picker | Card button | Full-width `.card`; shows `.acct-icon`, name, available/solde, chevron. Opens account picker sheet. Min 56px. |
| Swap button | Icon button | 36px circle, `primary-50`/`primary-600`, swaps from↔to with a 180° rotate animation. `aria-label="Inverser De et Vers"`. |
| Amount display | Text | `.amount` 34px tabular. `aria-live="polite"`. |
| Quick chips | `.chip` | `+50`, `+100`, `+200`, `Tout`. Add/replace amount. "Tout" = full `from` balance. Min 44px hit. |
| Internal-move note | Caption | Static explainer; clarifies exclusion from totals. |
| Date row | Picker row | Optional; default today. |
| "Effectuer le virement" | Primary button | Full-width, `primary-600`, min 48px. Disabled until valid. |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `from` | ref (account id) | `acc_courant` | Required. Must differ from `to`. Archived excluded. |
| `to` | ref (account id) | `acc_epargne` | Required. Must differ from `from`. Archived excluded. |
| `amount` | number (€) | `200.00` | Required, `> 0`, ≤2 decimals. **No upper bound** — may exceed the `from` balance; the source simply goes negative (§13.1, §13.2). Max 9 999 999,99. |
| `note` | string | "Épargne mensuelle" | Optional, ≤80 chars. |
| `date` | ISO date | `2026-06-24` | Required, default today. |
| **Linked legs (created on save)** | 2 transactions | — | Leg A: `kind=transfer`, sign −, account=`from`, linkedId=B. Leg B: `kind=transfer`, sign +, account=`to`, linkedId=A. Excluded from income/expense totals; included in balances. |

## States

- **Empty state:** Amount `0,00`, primary disabled. From/To pre-filled to two different accounts. Caption "Entrez un montant" under amount in `neutral-400`.
- **Loading state:** Primary shows spinner after tap; sheet inputs disabled; prevents double-submit.
- **Error state:** `from === to` (e.g. after a bad swap/pick) → both pickers get a `danger-500` ring + caption "Sélectionnez deux comptes différents."; primary disabled.
- **Over-transfer (amount > `from` balance):** **allowed** — the source goes negative (§13.1). The amount display stays its normal color (not red); a neutral `caption` under the amount notes "Le compte source passera à `<new from balance>` €." so the consequence is visible but not blocking. Primary stays enabled. The "Tout" chip sets amount = full `from` balance (a convenience, not a limit); the user may type beyond it freely.
- **Populated state:** De = Compte courant (Dispo 2 190,30 €); Vers = Épargne (Solde 1 540,00 €); amount **200,00 €**; quick chips visible; note "Mouvement interne — ni revenu ni dépense."; primary enabled.
- **Single-account state:** If the user has only one non-archived account, the sheet shows a centered empty illustration + "Ajoutez un second compte pour effectuer un virement." + ghost button "Gérer les comptes" → Accounts (13). Primary hidden.
- **"Tout" state:** Amount = full `from` balance; caption "Tout le solde de <from>.".

## Interactions & Micro-animations

- **Swap** — tap the circular swap button: from↔to exchange with a 180° rotate of the icon and a FLIP cross-fade of the two cards (280ms emphasized ease). Haptic light.
- **Quick chips** — tap adds/sets the amount (e.g. `+50` adds 50; `+200` sets 200; "Tout" sets full balance). Chips `scale(.98)` on press.
- **Account pick** — tapping a picker opens the account switcher sheet (excludes the opposite side); selecting updates with a 120ms cross-fade and re-evaluates "Tout"/overdraw.
- **Amount entry** — typed via the underlying numpad input or keyboard; live update; no count-up on direct input.
- **Save ("Effectuer le virement"):**
  1. Validate (from ≠ to, amount > 0). No balance cap — over-transfers are allowed (§13.1).
  2. Write **two linked legs**: −amount on `from`, +amount on `to`, same `date`/`note`, linked by id.
  3. Both balances update instantly (balances are derived; the legs feed the formula in §13.1).
  4. Toast "Virement effectué" (`success-600`, 4s). Sheet slides down + fades (200ms standard ease).
- **Dirty guard** — close/scrim/swipe-down with amount > 0 or changed accounts → "Abandonner les modifications ?" sheet.
- Pressed: `scale(.98)`, darken, 120ms.

## Accessibility Notes

- From/To pickers are `role="combobox"`/buttons with `aria-label`="Compte source" / "Compte destination"; selected account announced.
- Swap button `aria-label="Inverser De et Vers"`; announcement "Compte source et destination inversés."
- Amount `aria-live="polite"`; overdraw caption `role="alert"` so "Solde insuffisant" is read.
- Quick chips: each `aria-label` ("Ajouter 50", "Tout le solde"), `role="button"`, ≥44px.
- Note "Mouvement interne — ni revenu ni dépense" is `role="note"`/`aria-describedby` on the primary action so AT users hear the semantic.
- Focus trap inside the sheet; first focus = From picker. Esc / scrim closes (with dirty guard). Drag handle is reachable but not focus-required (button alternatives exist).
- `prefers-reduced-motion`: no rotate/FLIP (swap is instant), opacity-only fade ≤150ms.

## Notes / Open Questions

- ✅ **Negative balances / overdraw — DECIDED (§13.1).** Negative balances are **allowed**; the transfer amount is **not** clamped at the `from` balance and there is no "Solde insuffisant" block. An over-transfer simply drives the source negative (shown with a neutral informational caption). No clamp, no warning toast.
- 🔴 **FX / multi-currency** (§13.8.2). N/A in V1 (single currency €). Confirm out of scope — the sheet assumes both accounts share €.
- 🔴 **Transfer leg visibility** — in Expense List (04) / transaction feeds, transfer legs may appear as "Virement vers <to>" / "Virement de <from>" pairs. Confirm they are visually grouped/badged (`.dir` `trf` = `primary`) and excluded from category/donut totals but shown in the list.
- 🔴 **"Tout" rounding** — setting amount = full balance when the balance has cents; confirm exactness (carry the precise decimal).
- 🔴 **Edit/delete a transfer** — editing should update both linked legs symmetrically; deleting one removes the pair. Confirm parity (out of scope for this sheet, belongs to Edit Transaction).
- 🔴 **From-balance live during entry** — if the user enters an amount then swaps, the amount stays (not re-clamped unless it now exceeds the new `from`). Confirm.
- The internal-move note is deliberately prominent: it prevents users from misusing a transfer as income/expense to game totals.
