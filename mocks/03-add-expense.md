# Add Expense (03)

## Purpose
The fastest path in the app: capture a single **expense** (amount, account, category, optional note/date) in under three taps. Opened as a **fullscreen modal** so the custom numpad has full viewport height and the thumb never reaches the screen top. Adds an **account picker** row (default = last-used account, or the currently-scoped account). Note: the FAB no longer opens this screen directly — it opens the **quick-action sheet** (Dépense / Revenu / Virement); Add Expense is reached via the **"Dépense"** tile.

All money is in **euros (€)**, single currency, French UI. Amounts use a comma decimal separator and space thousands separator (fr-FR), e.g. "12,50 €".

## Navigation
- **Arrives from:** the **"Dépense" tile** of the quick-action sheet (`.qas`), itself opened from the center FAB on any tab root (Accueil 02, Stats 08, Calendrier 06, Réglages 09). Also deep-linkable via `/add` (which opens Add Expense directly for parity, per nav map §8.3). Transition: FAB → quick-action sheet → Dépense tile → fullscreen modal, slide-up + fade, `cubic-bezier(.3,.0,.0,1)` 280ms (emphasized).
- **Account scope on open:** the account picker defaults to the **currently-scoped account** if the origin screen had one, else the **last-used account** for an expense, else the first account. Deep-link `/add?account=<id>` overrides. If no account exists yet, the modal shows a blocking prompt to create one (see States).
- **Goes to:**
  - **OK / Enregistrer** (top-bar primary) → validates, writes the expense tied to the picked account, closes the modal (slide-down + fade 200ms), returns to origin, fires a `success-600` toast "Enregistré · 12,50 € → Courses" (4s).
  - **Annuler / ← chevron / scrim tap / swipe-down** → if form is dirty, confirm-discard sheet ("Abandonner les modifications ?"); else close immediately.
  - **Account chip** → opens the **account picker sheet** (a bottom sheet: one row per account with type dot + name + balance; selecting one updates the picker row in place). There is no "Gérer" entry here (keep the modal focused); account creation is done from the Dashboard/Settings.
  - **Category chip "Gérer"** (trailing chip in the category row) → pushed Category Management (05); on return, the newly created category is auto-selected.
  - **Date field** → native date picker or bottom-sheet calendar (🔴 chrome TBD).
- **No bottom nav** is shown while this modal is open (per nav map §3). The FAB is hidden while the modal is open.

## Layout Description
A single fullscreen modal surface, bg `white` (light) / `neutral-900` (dark), honoring `env(safe-area-inset-*)` top and bottom. Content uses `space-4` (16px) gutters; `gap` ~8px between stacked blocks. Reading top-to-bottom:

### 1. Top bar (56px + top safe-area)
Sticky, bg `white`/`neutral-900` (the mock uses a plain white screen bg). Three zones:
- **Left:** a Ghost "Annuler" button (`btn-ghost btn-sm`, text `primary-600`, 44×44 hit). Closes the modal (dirty-guard applies).
- **Center:** title **"Nouvelle dépense"** (`tb-title`, `h3` 16px/600, centered).
- **Right:** a compact Primary **"OK"** button (`btn-primary btn-sm`, bg `primary-600`, white text). This is the Save affordance. Disabled (`neutral-200`/`neutral-400`) until amount > 0 **and** a category is selected. Min 44px hit.
- The top bar is the drag source for swipe-down-to-dismiss (the whole bar is the implicit handle).

### 2. Account picker row (directly under top bar, `space-2` below)
A `card tight` row using `row-between` layout, padding `space-2`×`space-3`:
- **Left:** a `body-sm`/600 label "Compte" (`neutral-700`).
- **Right:** an **`.acct-chip`** button (height ~32px, 1px `neutral-200` border, `radius-full`): `.acct-dot` (8px, the account's type color, e.g. `primary-600` for Courant) + account name (`13px`/600, e.g. "Courant") + `ChevronDown` (14px, `neutral-400`). Tapping opens the **account picker sheet**. ARIA reflects the current account.
- This row makes the expense's account explicit and editable — required because the app is multi-account. The chosen account receives the −amount on save.

### 3. Live amount display (hero region, centered, `space-2` above)
- A `label` "Montant" eyebrow (`neutral-500`/`neutral-400`, UPPERCASE).
- Below it, a baseline-aligned flex row centered: the **live amount** in `.amount` style (`display-amount`, 40px/700, tabular figures, tracking -0.02em) colored `primary-600`, followed by a smaller **"€"** glyph in `.h2` muted (`neutral-400`). E.g. **"12,50 €"**. Placeholder: the amount reads `0` in `neutral-300` until the first digit is entered; the `€` stays muted.
- Numbers use a **comma** decimal separator (fr-FR). Very long amounts shrink letter-spacing only, never the font size.

### 4. Quick-amount chips row (centered, `space-2` below amount, `.chip-row`)
Four additive pills: **`+5` · `+10` · `+20` · `+50`**. Each `.chip` (`radius-full`, `body-sm`, default bg `neutral-100`/text `neutral-700`; pressed `neutral-200`). A tap **adds** to the current amount (not replaces) — e.g. `12` + `+10` → `22,00`; `12,50` + `+5` → `17,50`. Each chip ≥44px tall. Horizontal scroll reveals nothing beyond the four. (Note: these are quick-add helpers, not the numpad's optional top row.)

### 5. Category picker (`.chip-row`, `space-2` below quick-amounts)
A horizontally scrollable row of category chips. Each `.chip`: Lucide category icon (14px) + label (`body-sm`), `radius-full`, `space-2`×`space-3`. Default bg `neutral-100`/text `neutral-700`; **`.active` (selected)** bg `primary-50`/text `primary-700`/icon `primary-600` + 1px `primary-200` border (the mock shows **Courses** active). The last chip is a special **"Gérer"** chip → Category Management (05).
- Default example set (French, fr-FR): **Courses** (`ShoppingCart`), **Restaurant** (`Utensils`), **Transport** (`Car`), **Loisirs** (`Film`), **Gérer** (`Settings2`). The full managed set lives in Category Management (05); only the first few + "Gérer" are surfaced here for speed.
- **Required field** — until one is selected, the top-bar "OK" stays disabled and a `caption` "Sélectionnez une catégorie" sits under the row (`neutral-400`).

### 6. Note + Date card (`card tight`, `space-2` below category)
A grouped card (padding `space-1` vertical, internal `divider` between rows):
- **Note row** (padding `space-2`×`space-4`): leading `Type`/`TextCursor` icon (18px, `neutral-400`), then a borderless `.input` (flex:1, height 32px, bg transparent) prefilled with the placeholder "Ajouter une note" (`neutral-400`). Example value "Courses du soir". Max 120 chars; counter "0/120" right-aligned under the field, turning `warning-600` at 110+. Optional — empty is valid.
- **`divider`** (1px `neutral-200`/`neutral-700`).
- **Date row** (padding `space-2`×`space-4`): leading `CalendarDays` icon (18px, `neutral-400`), then a read-only text span (flex:1, `15px`) showing the date in fr-FR long form, e.g. **"Aujourd'hui, 24 juin"** (defaults to today; shows "Aujourd'hui" prefix when the date equals today), trailing `ChevronRight` (16px, `neutral-300`). Tapping opens the date picker.

### 7. Spacer
Flexible empty region absorbing leftover height so the numpad pins to the bottom. (Ensures the numpad never scrolls.)

### 8. Numpad (custom, 4×4, sticky bottom, never scrolls)
Pinned above the bottom safe-area (`padding: 10px 16px 28px`, `margin-top:auto`). 4 columns × 4 rows of flex tiles:
- Reading order: `1 2 3 / 4 5 6 / 7 8 9 / . 0 ⌫`.
- Each `.key`: `radius-md`, bg `neutral-100`/dark `neutral-800`, numerals `h3`-sized (≥28px/700, tabular), text `neutral-900`/`neutral-50`. Pressed: bg `neutral-200`/`neutral-700`, `scale(.98)` 120ms `ease-out`, **haptic tap** where available. Keys ≥44×44px (on a 360px screen ~84px-wide tiles). Spacing `space-2` between tiles.
- **Decimal `,` (display) / `.` (input) key:** styled transparent bg, `neutral-400`. The on-screen key shows `,` to match fr-FR display, but the underlying value model uses a decimal point internally. Inserts a decimal separator **only if** none exists yet; otherwise a no-op (still a light haptic). Caps at 2 decimal places — a third digit is ignored.
- **`0` key:** standard. Prevents leading zero (`0` then `5` → `5`); a second `0` when value is `0` is a no-op unless a separator exists (`0,0` allowed).
- **Backspace `⌫`** (`Delete`/`ChevronLeft`-arrow icon, 26px, `neutral-700`, transparent bg): deletes the last character; empty → placeholder `0` (`neutral-300`). Long-press (≥500ms) clears the entire amount.

### 9. Save affordance
Per the mock, the primary Save lives in the **top bar** ("OK"), keeping the bottom area free for the numpad. There is no separate bottom Save button. (If a bottom Save is later preferred, it would sit below the numpad — 🔴 see Open Questions.)

## Components & Elements

| Element | Type | Details |
|---|---|---|
| Top bar | Top bar (sticky) | 56px+safe-area; left "Annuler" (ghost), center "Nouvelle dépense" (`h3`), right "OK" (primary, disabled until valid). |
| Account picker row | `card tight row-between` | "Compte" label + `.acct-chip` (dot + name + chevron) → account picker sheet. |
| Account chip | `.acct-chip` button | `radius-full`, 1px `neutral-200` border; type-colored dot + name + `ChevronDown`. |
| Amount label | `.label` | "MONTANT", `neutral-500`. |
| Live amount | Text (`.amount`/`display-amount`) | 40px/700, tabular, `primary-600`; placeholder `0` `neutral-300`. |
| Currency symbol | Text (`.h2` muted) | "€", `neutral-400`, after the number. |
| Quick-amount chips | Chips (×4) | `+5`, `+10`, `+20`, `+50`; `radius-full`; additive. |
| Category chips | Chips (horizontal scroll) | Icon + label; default vs `.active`; trailing "Gérer" → 05. |
| Note row | Borderless `.input` + icon | "Ajouter une note" placeholder; 120-char cap; counter. |
| Date row | Read-only text + icon | "Aujourd'hui, 24 juin"; trailing chevron; opens picker. |
| Numpad | Custom 4×4 grid | `1-9`, `,`, `0`, `⌫`; haptic per key; sticky bottom. |
| Decimal key | Numpad key | One separator only; 2-dp cap; transparent bg. |
| Backspace key | Numpad key | Char delete; long-press clears all. |
| OK (Save) | Primary button (top bar) | Disabled until amount>0 + category set; success closes modal + toast. |
| Account picker sheet | Bottom sheet (conditional) | One row per account (dot + name + balance); updates picker. |
| Confirm-discard sheet | Bottom sheet (conditional) | "Abandonner les modifications ?" Danger "Abandonner" + Ghost "Continuer". |

## Data Fields

| Field | Type | Example Value | Validation |
|---|---|---|---|
| `accountId` | ref (account id) | `acc_courant` | Required; default = scoped/last-used; must resolve to an existing account. |
| `amount` | number (decimal, 2-dp) | `12.50` | Required; > 0; ≤2 dp; no leading zeros; 🔴 confirm max integer digits (propose 7 → 9 999 999,99 €). |
| `categoryId` | ref (category id) | `cat_courses` | Required; must resolve to an existing expense category. |
| `note` | string | "Courses du soir" | Optional; 0–120 chars; single-line-ish (wraps to 2). |
| `date` | ISO date | `2026-06-24` | Required; defaults to today; 🔴 allow future dates? (propose: yes, no clamp). |
| `kind` | enum (fixed) | `expense` | Always `expense` on this screen (income/transfer have their own screens). |
| `dir` | enum (derived) | `out` | Always `out` for an expense; drives the `.dir` badge elsewhere. |
| `createdAt` | timestamp (auto) | `2026-06-24T14:03:22Z` | Auto-set on save; not user-editable. |
| `syncState` | enum | `pending` | Auto; `pending` when offline (per nav map §6). |

## States
- **Empty state:** Amount placeholder `0` (`neutral-300`); account chip shows the default account; no category selected (note row helper "Sélectionnez une catégorie"); Note empty with placeholder; Date = today ("Aujourd'hui, 24 juin"); "OK" disabled (`neutral-200`/`neutral-400`).
- **No-account state (blocking):** If no account exists when the modal opens, the body is replaced by a centered prompt: `Wallet` icon (32px, `neutral-300`), `.h3` "Créez d'abord un compte", `body-sm` `neutral-500` "Une dépense doit être rattachée à un compte.", a Primary "Créer un compte" → Accounts management (13), and a Ghost "Annuler". The numpad and fields are hidden. (🔴 confirm gating vs. auto-creating a default "Compte courant".)
- **Loading state:** Save tap swaps "OK" to "…" + a 16px `primary-400` spinner (label muted), numpad + fields non-interactive for the ~instant local write. No full-screen spinner.
- **Error state:** Write failure (local store quota / corrupted category ref) → "OK" re-enables, `danger-600` toast "Échec de l'enregistrement — réessayez" (6s + dismiss), form stays populated. Field-level: category ref unresolved → category row helper turns `danger-600` "Catégorie indisponible, choisissez-en une autre". Account ref unresolved (deleted elsewhere) → account chip shows "Compte indisponible" `danger-600`, picker forced open.
- **Populated state:** As the user types, the live amount updates instantly (no count-up). Selecting a category flips that chip to `.active` and may enable "OK" (if amount > 0). Quick-amount chips visibly nudge the amount. "OK" fades to enabled the moment both gates pass.

## Interactions & Micro-animations
- **Quick-action sheet → modal:** the "Dépense" tile morphs/slides into the fullscreen modal (`cubic-bezier(.3,.0,.0,1)` 280ms). (Direct `/add` deep-link uses a plain slide-up + fade.)
- **Numpad key tap:** bg flash to `neutral-200`, `scale(.98)` 120ms, haptic (10ms); live amount updates same frame.
- **Quick-amount chip tap:** chip briefly fills `primary-50` (200ms); changed digits get a 1-frame pop.
- **Category select:** `.active` styling cross-fades 150ms; previously selected returns to default in parallel.
- **Account chip → picker sheet:** sheet slides up 16px + fade (200ms); selecting an account updates the `.acct-chip` dot/name with a 150ms cross-fade and closes the sheet.
- **Decimal no-op:** a second `,` still scales/haptics lightly but the amount is unchanged.
- **Backspace long-press:** after 500ms, the amount clears with a 150ms fade to `0`.
- **Save success:** "OK" `scale(.98)`, modal slides down + fades out (200ms); origin receives a `success-600` toast sliding up.
- **Swipe-down dismiss:** whole top bar follows the finger; release past 40% height → close; else snap back (200ms). Reduced-motion: skip follow, opacity-only ≤150ms.
- **Confirm-discard:** on Annuler/scrim/swipe-down **only if** dirty (amount ≠ 0, category set, note non-empty, date ≠ today). Sheet slides up 16px + fade; "Abandonner" is Danger ghost (`danger-600` text on `danger-50` press fill), "Continuer" is Ghost (`primary-600`).
- **Reduced motion:** disable morph/scale pops, cap fades ≤150ms, disable swipe-follow (snap on release).

## Accessibility Notes
- **Focus order:** Annuler → Account chip → Amount display (focusable `role="group"`, `aria-label="Montant, zéro euro"`) → quick-amount chips → category radiogroup → Note input → Date field → numpad keys → OK.
- **Screen reader:** live amount uses `aria-live="polite"` so each keystroke announces the new total ("douze euros cinquante" / raw digits — 🔴 confirm spoken form). Category row announces selection. "OK" exposes `aria-disabled` until valid; reachable but not activatable when invalid. Account chip announces `aria-haspopup="dialog"` + the current account name.
- **Numpad a11y:** operable by tap and physical keyboard (1-9, `,`/`.`, `0`, Backspace). Each key exposes `aria-label` (decimal key `aria-label="séparateur décimal"`, backspace `aria-label="effacer le dernier chiffre"`).
- **Tap targets:** every interactive element ≥44×44 (numpad tiles ~84, chips padded to 44 min-height, "Annuler"/"OK" compact buttons padded to 44, account chip padded).
- **Contrast:** `primary-600` amount on `white`/`neutral-900` ≥4.5:1; `neutral-400` placeholder on `white` verified ≥4.5:1 for `.body-sm`+ sizes.
- **Keyboard:** Esc → Annuler/discard flow. Enter → Save when enabled.
- **Reduced motion:** as above.

## Notes / Open Questions
- 🔴 **Save placement** — the mock puts Save in the top bar ("OK"), freeing the bottom for the numpad. The prior spec assumed a big bottom Save. Confirm top-bar "OK" is the locked pattern (note: it's a thumb reach; weigh against the numpad's bottom real estate).
- 🔴 **No-account gating** — modal blocks until an account exists. Confirm vs. auto-creating a default "Compte courant" on first expense.
- 🔴 **Decimal separator display** — the key shows `,` (fr-FR) while the internal model uses `.`. Confirm the display key label and that copy-paste/keyboard entry accepts both `,` and `.`.
- 🔴 **Quick-action sheet as the only FAB path** — Add Expense is no longer one tap from the FAB (it's FAB → sheet → Dépense). Confirm this is acceptable for the "fast first" principle, or allow `/add` deep-link/FAB-double-tap shortcuts (nav map §7.2).
- 🔴 **Category set surfaced** — only the first few categories + "Gérer" are shown for speed. Confirm the number (4 in mock) and ordering (most-used vs. fixed).
- 🔴 **Max integer digits** — propose 7 (9 999 999,99 €) as a sane ceiling; confirm.
- 🔴 **Future-dated expenses** — allow or clamp to today? Affects the "Aujourd'hui" prefix logic.
- 🔴 **Date picker chrome** — native `<input type="date">` vs a custom bottom-sheet calendar (on-brand). Recommend sheet, defer if time-boxed.
- 🔴 **Spoken-amount form (fr)** — friendly ("douze euros cinquante") vs literal. Recommend friendly.
