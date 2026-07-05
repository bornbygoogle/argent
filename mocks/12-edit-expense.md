# Edit Expense (12)

## Purpose
The edit-mode twin of Add Expense (03): same layout, same numpad, same fields — but pre-filled with an existing transaction's values, now exposing the **account** (shown and editable; editing it **moves** the transaction between accounts), and adding the destructive ability to **delete** the transaction. Handles a **recurring-derived** note when the expense originated from a confirmed recurring occurrence. Reachable from any movement/expense row tap.

All money is in **euros (€)**, single currency, French UI. Amounts use a comma decimal separator and space thousands separator (fr-FR), e.g. "28,90 €".

## Navigation
- **Arrives from:**
  - Expense List (04) — tap on a row → `/expenses/:id` (pushed screen per nav map §3; a modal variant is flagged 🔴 nav map §7.3).
  - Dashboard (02) — tap on a recent movement row (Dépense kind).
- **Goes to:**
  - **Enregistrer les modifications** (bottom primary) → validates, writes, returns to origin, `success-600` toast "Dépense modifiée" (4s). If the account changed, the balance updates on both the old and new accounts.
  - **← back chevron / edge swipe-right / scrim tap** → dirty-form guard if changed, else return to origin.
  - **Overflow (⋯) menu** → "Dupliquer" (opens Add Expense 03 pre-filled, new id + today's date) and "Supprimer" (alternate path to the bottom delete). (🔴 confirm whether duplicate carries the account or defaults to last-used.)
  - **Supprimer cette dépense** (bottom danger ghost) → destructive **center-modal** confirmation (design system §8); on confirm → delete, return to origin, `danger-600` toast "Dépense supprimée" (4s + "Annuler" undo action).
  - **Account row** (new, shown/editable here) → opens the **account picker sheet**; choosing a different account moves the transaction (−amount leaves the old account, +amount counted on the new). See "Editing account moves the transaction" below.
- **No bottom nav** (pushed/modal screen, per nav map §3).

## Layout Description
Identical skeleton to Add Expense (03) — fullscreen surface, bg `white`/`neutral-900`, safe-area aware, `space-4` gutters, ~10px block gap. Differences are called out below; everything not mentioned matches 03 exactly.

### 1. Top bar (56px + top safe-area)
Sticky, bg `white`/`neutral-900`. Three zones:
- **Left:** back `ChevronLeft` ghost `.icon-btn` (22px, 44×44 hit, `neutral-700`/`neutral-100`). Returns to origin (dirty-guard applies).
- **Center:** title **"Modifier la dépense"** (`tb-title`, `h3` 16px/600, centered).
- **Right:** **Overflow (⋯)** — a `MoreVertical` ghost `.icon-btn` (22px, 44×44 hit, `neutral-700`). Tapping opens a small dropdown (`radius-md`, `shadow-lg`, bg `white`/`neutral-800`) anchored below: **"Dupliquer"** (`Copy`, `neutral-700`), divider, **"Supprimer"** (`Trash2`, `danger-600`).
- Unlike 03 (which has "OK" in the top bar), the **primary Save here lives at the bottom**; the top-right is the overflow menu.

### 2. Live amount display (hero region, centered)
Same as 03: `label` "Montant"; baseline flex row of the live amount (`.amount`/`display-amount`, 40px/700, tabular, `primary-600`) + muted "€" (`.h2`). **Pre-filled** with the existing amount, e.g. **"28,90 €"**. Fully editable via the numpad.

### 3. Quick-amount chips row
Same four additive chips as 03 (`+5` · `+10` · `+20` · `+50`). Operates on the current (pre-filled) amount.

### 4. Category picker
Same horizontal chip row as 03. **Pre-selected** to the transaction's category (that chip renders `.active` on mount). "Gérer" trailing chip present. 🔴 If the stored `categoryId` was deleted in Category Management, show an "Catégorie inconnue" chip (`neutral-300`/`danger-600`) and require a new selection before Save.

### 5. Note + Date + Répéter card (`card tight`)
A grouped card (internal `divider`s between rows). **Note** and **Date** rows match 03, plus a new **Répéter** row:
- **Note row:** `Type` icon (18px, `neutral-400`) + borderless `.input` **pre-filled**, e.g. "Courses du soir — Carrefour". 120-char cap + counter.
- **`divider`.**
- **Date row:** `CalendarDays` icon + read-only text, **pre-filled** with the transaction's date **and time**, e.g. **"Aujourd'hui, 24 juin · 18:42"** (the time is shown here because this is an existing record; 03 shows date only). Trailing `ChevronRight`. The "Aujourd'hui" prefix appears only if the date equals today.
- **`divider`.**
- **Répéter row:** `Repeat`/`ArrowLeftRight` icon (18px, `neutral-400`) + label "Répéter" (flex:1) + a **toggle** pill (`.toggle`, 44×24 track, on=`primary-600`, off=`neutral-300`). Pre-set to the transaction's repeat value. Toggling on opens a cadence sheet (Off · Hebdo · Mensuel · Annuel — 🔴 cadence is descriptive per design system §13.8.3). See "Recurring-edits-if-derived" below for the special case.

### 6. "Modifié …" caption
A centered `.caption` (12px/500, `neutral-400`) directly under the card: **"Modifié il y a 2 min"** (relative time; "Créé le 22 juin" appended if useful). 🔴 relative-time thresholds TBD (e.g. "à l'instant" <60s, "X min" <60m, "X h" <24h, then absolute date).

### 7. Spacer
Flexible, as in 03, so the bottom action cluster pins.

### 8. Numpad (custom, 4×4)
Identical to 03: `1-9`, `,`, `0`, `⌫`; haptic per key; sticky bottom; decimal/2-dp rules unchanged. Pre-fills do not change numpad behavior — it edits the current amount string.

### 9. Account row (new — shown & editable)
Unlike 03 (where the account picker sits directly under the top bar), Edit Expense surfaces the account as the **first row inside the Note/Date/Répéter card** (or as its own `card tight row-between` directly above that card, matching 03's account row styling). It is **pre-filled** with the transaction's account and **editable**:
- Layout: "Compte" label (left) + `.acct-chip` (right) showing the account's type dot + name (e.g. "Courant") + `ChevronDown`. Tapping opens the **account picker sheet**.
- **Editing account moves the transaction:** selecting a different account re-routes the −amount (old account's balance goes back up, new account's goes down). Because transfers are a separate kind, this is a simple account reassignment, not a transfer. A `caption` helper appears under the row when changed: "La dépense sera déplacée vers <nouveau compte>" (`warning-600`, `ArrowRightLeft` icon). The change is committed on Save.
- 🔴 If the transaction was the confirmation of a recurring occurrence, moving its account is **blocked** (recurring occurrences are tied to their account; see below). The chip is disabled with a tooltip "Compte verrouillé (échéance récurrente)".

### 10. Bottom action cluster (pinned above safe area)
- **"Enregistrer les modifications"** — full-width Primary button (`btn-primary btn-block`, bg `primary-600`, white, min-height 48px). Disabled (`neutral-200`/`neutral-400`) until the form is both **valid and dirty**. On enable, 150ms opacity fade.
- **"Supprimer cette dépense"** — full-width **Danger ghost** button (`btn-ghost btn-block`, height 44px, text `danger-600`, `Trash2` icon 18px, bg `danger-50` on press). Opens the destructive confirm center-modal. Sits `space-2` below Save.

## Components & Elements

| Element | Type | Details |
|---|---|---|
| Top bar | Top bar (sticky) | Left Back (`ChevronLeft`), center "Modifier la dépense" (`h3`), right Overflow (`MoreVertical`). |
| Amount label | `.label` | "MONTANT". |
| Live amount | Text (`.amount`/`display-amount`) | 40px/700, tabular, `primary-600`; pre-filled, e.g. "28,90 €". |
| Currency symbol | Text (`.h2` muted) | "€", `neutral-400`. |
| Quick-amount chips | Chips (×4) | `+5`, `+10`, `+20`, `+50`; additive. |
| Category chips | Chips (horizontal scroll) | Pre-selected `.active`; trailing "Gérer". |
| Account row | `card tight row-between` | "Compte" + `.acct-chip` (pre-filled, editable); → account picker sheet. Blocked if recurring-derived. |
| Note row | Borderless `.input` + icon | Pre-filled; 120-char cap + counter. |
| Date row | Read-only text + icon | Pre-filled with date **and time** ("Aujourd'hui, 24 juin · 18:42"); chevron → picker. |
| Répéter row | Toggle + cadence sheet | Pre-set; off→on opens cadence picker. |
| "Modifié …" caption | `.caption` | `neutral-400`; relative time. |
| Numpad | Custom 4×4 grid | Identical to 03. |
| Save (bottom) | Primary button (block) | "Enregistrer les modifications"; disabled until valid+dirty. |
| Delete (bottom) | Danger ghost button (block) | "Supprimer cette dépense"; → confirm modal. |
| Overflow menu | Dropdown | Dupliquer / Supprimer (danger). |
| Delete-confirm modal | Center modal | Destructive confirm per design system §8. |
| Account picker sheet | Bottom sheet (conditional) | One row per account; selecting moves the transaction. |
| Discard-confirm sheet | Bottom sheet (conditional) | Same as 03. |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `id` | string (immutable) | `txn_01HZX…` | Required; identifies the record. Not editable. |
| `accountId` | ref (account id) | `acc_courant` | Required; editable (moves the txn); must resolve. Blocked if `recurringSourceId` set. |
| `amount` | number (decimal, 2-dp) | `28.90` | Required; > 0; ≤2 dp; 🔴 max integer digits (propose 7). |
| `categoryId` | ref (category id) | `cat_courses` | Required; must resolve; 🔴 handle deleted ref. |
| `note` | string | "Courses du soir — Carrefour" | Optional; ≤120 chars. |
| `date` | ISO date (+ time stored) | `2026-06-24T18:42` | Required; pre-filled to txn date/time. |
| `repeat` | enum | `off` | `off` \| `hebdo` \| `mensuel` \| `annuel`; default `off`. 🔴 descriptive only (§13.8.3). |
| `recurringSourceId` | ref (nullable) | `recur_loyer` | Set if this txn was created by confirming a recurring occurrence. Blocks account move; limits edits. |
| `dir` | enum (derived) | `out` | Always `out` for an expense. |
| `updatedAt` | timestamp (auto) | `2026-06-24T14:03:22Z` | Auto on save; drives "Modifié …". |
| `createdAt` | timestamp (immutable) | `2026-06-24T18:42:00Z` | Shown in caption; not editable. |
| `syncState` | enum | `pending` | Auto; `pending` if offline. |

## States
- **Empty state:** N/A — this screen always opens populated (a record must exist). Closest analog is **pristine**: form matches the stored record exactly, "Enregistrer" disabled, "Supprimer" enabled.
- **Loading state:** On open, a brief skeleton (grey `neutral-200` blocks for amount/category/note) for the ~instant local read; caption and fields hydrate together. On Save, the button label swaps to "Enregistrement…" + 16px `primary-400` spinner, numpad + Delete non-interactive momentarily. Delete-confirm's "Supprimer" shows "Suppression…" similarly.
- **Error state:** Save failure → `danger-600` toast "Échec de la modification — réessayez" (6s + dismiss), form retains edits, Save re-enables. Delete failure → `danger-600` toast "Échec de la suppression — réessayez". If the record was deleted on another device / not found, the screen shows a centered empty-state: `FileQuestion`/`Inbox` icon (32px, `neutral-300`), `body` "Cette dépense n'existe plus", Ghost "Retour à la liste".
- **Populated state (default):** All fields show stored values; as the user edits, "Enregistrer" transitions disabled→enabled the moment the form is valid **and** dirty (150ms opacity fade). Dirty detection compares each field to its loaded snapshot. Changing the account sets the "sera déplacée" warning caption and counts as dirty.

## Interactions & Micro-animations
- **Enter transition:** pushed-slide (standard ease, 200ms) or modal slide-up+fade (280ms emphasized), per 🔴 push-vs-modal decision (nav map §7.3).
- **Numpad / chips / category / inputs / account chip / picker sheet:** identical micro-animations to 03 (haptic, `scale(.98)` 120ms; picker sheet slide-up 16px + fade).
- **Dirty → Save enable:** 150ms opacity fade (no scale pop).
- **Account change:** `.acct-chip` cross-fades 150ms; "sera déplacée" `warning-600` caption fades in.
- **Overflow menu open:** dropdown fades + slides down 8px (120ms); scrim/outside tap dismisses.
- **Delete tap → confirm:** center modal scales/fades in (`shadow-lg`, `radius-xl`, 200ms); backdrop `rgba(15,23,42,.45)` fades. Modal contents: `Trash2` icon (32px, `danger-600`), title "Supprimer la dépense ?" (`h3`), body "Cette action supprimera définitivement 28,90 € de Courses. Elle est irréversible." (`body-sm`, `neutral-500`), full-width Danger primary "Supprimer" (`danger-600` bg, white) + Ghost "Annuler" below. On confirm: modal fades out, screen returns to origin, `danger-600` toast with "Annuler" undo (4s).
- **Swipe-back / swipe-down dismiss:** blocked by confirm-discard sheet when dirty.
- **Reduced motion:** disable slides/scale pops, opacity-only ≤150ms, modal uses opacity-only entry.

## Accessibility Notes
- **Focus order:** Back → Overflow → Amount display (`role="group"`, `aria-label` reflects value) → quick-amount chips → category radiogroup → Account chip → Note → Date → Répéter toggle → "Modifié …" caption (focusable `role="text"`) → numpad keys → Save (bottom) → Delete (bottom). Delete is announced as destructive (`aria-label="Supprimer la dépense, action destructive"`).
- **Screen reader:** on open, announce "Modification de la dépense, vingt-huit euros quatre-vingt-dix, Courses, vingt-quatre juin dix-huit heures quarante-deux, compte Courant". Save exposes `aria-disabled` until editable. Delete-confirm modal traps focus (`role="alertdialog"`, `aria-labelledby`/`aria-describedby`); initial focus lands on **"Annuler"** (safer default for destructive actions), not "Supprimer".
- **Account chip:** `aria-haspopup="dialog"` + current account; when blocked (recurring-derived), `aria-disabled="true"` + `aria-label` includes "verrouillé".
- **Tap targets:** all ≥44×44; compact top-bar Back/Overflow buttons padded to 44; Save/Delete full-width ≥48/44.
- **Contrast:** `danger-600` text on `white` and on `danger-50` both ≥4.5:1; `warning-600` caption verified.
- **Reduced motion:** as above.
- **Keyboard:** Esc → Back/discard flow (closes overflow menu first if open); arrow keys move between menu items; Enter → Save when enabled.

## Notes / Open Questions
- 🔴 **Recurring-edits-if-derived** — when `recurringSourceId` is set (this expense came from confirming a recurring occurrence), editing is constrained: the **account is locked** (recurring occurrences are tied to their account), and amount/category edits apply to **this occurrence only** (history is immutable per §13.4; the recurring rule's forward amount is edited in Recurring 15, not here). The "Répéter" toggle is also hidden/locked for derived rows. Confirm this constraint set and the exact lock UI (disabled chip + tooltip proposed).
- 🔴 **Editing account moves the transaction** — selecting a different account reassigns the −amount (no transfer created). Confirm this simple reassignment is correct vs. requiring an explicit transfer for cross-account moves.
- 🔴 **Push vs. modal presentation** (nav map §7.3). Pushed assumed; a bottom-sheet variant would change the top bar (drag handle instead of chevron) and bottom cluster.
- 🔴 **Save placement (bottom here vs. top in 03)** — Edit uses a bottom primary "Enregistrer les modifications" + bottom Danger "Supprimer", while Add uses a top-bar "OK". Confirm this asymmetry is intentional (Edit has no numpad-bottom conflict? — it does share the numpad; verify the bottom cluster sits below the numpad without crowding). 🔴 alternate: keep Save in the top bar (like 03) and Delete in overflow only.
- 🔴 **Delete discoverability** — surfaced both as a bottom Danger button **and** in the overflow menu. Decide whether redundancy is desired (recommend keeping the bottom button primary).
- 🔴 **Undo window for delete** — toast offers "Annuler"; confirm grace period (propose 4s) and soft-delete-until-expiry semantics.
- 🔴 **"Modifié …" relative-time format** — confirm thresholds ("à l'instant" / "X min" / "X h" / absolute date).
- 🔴 **Duplicate behavior** — does "Dupliquer" carry the original account or default to last-used? Propose: carry the original account, fresh date = today.
- 🔴 **Deleted category ref** — "Catégorie inconnue" chip proposed; require re-selection before Save. Confirm.
- 🔴 **Currency / i18n / max-digits** — inherited from 03 and design system §12.4.
