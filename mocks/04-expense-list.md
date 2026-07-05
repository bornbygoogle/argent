# Movements List (04)

## Purpose
A pushed, full-screen list of **every movement** on the user's accounts — expenses, income, and transfers — grouped day-by-day with sticky day headers and per-day subtotals, plus search and multi-dimensional filtering. It generalizes the former "Expense List" to the multi-account model: an **account filter chip** scopes the list to one account or all, and a **transaction-kind filter** (Dépense / Revenu / Virement / Tous) selects what is shown. Each row carries a **direction badge** (`.dir`) and an **account tag** so the user always knows where the money came from or went. It is the detailed drill-down behind the Dashboard's "See all" affordance and the home of bulk operations (edit, duplicate, delete) on transactions.

## Navigation
- **Arrives from:** Dashboard (02) via the "See all" chevron next to the recent-transactions section, or via the monthly hero card with a pre-applied `?month=` filter, or via the account switcher sheet's "Voir les mouvements" entry. Route: `/expenses` (now better read as `/movements` but kept for route parity) and supports query params `?account=all|<id>&kind=all|expense|income|transfer&cat=&from=&to=&q=&min=&max=` that fully restore the filtered state on deep-link/back-forward (Nav Map §8.2: scope-carrying screens accept `?account=all|<id>`).
- **Edge-swipe right** (Nav Map §5) = OS back; mirrored by the on-screen back chevron in the top bar.
- **Goes to:**
  - Back chevron / edge-swipe → returns to Dashboard (02) or origin screen, **restoring the prior scroll position**.
  - Tap a row → Edit Expense (12) at `/expenses/:id` for expenses; Add/Edit Income (14) for income; Transfer (16) for transfers (pushed screen / sheet per Nav Map §3 / §8.2).
  - Tap the **account chip** in the top bar → opens the **Account switcher sheet** (`Tous les comptes` + list + `Gérer`), per design system §13.6. Switching updates the list in place (no full navigation).
  - Tap the global center FAB → Quick-action sheet → { Dépense (03) · Revenu (14) · Virement (16) } (the FAB is hidden per Nav Map §2 while this is a pushed screen with no bottom nav — **see 🔴 open question 1**).
  - Pull-to-refresh → re-syncs from local store (offline: no-op on network, but re-reads local DB).
- **No bottom nav** (pushed screen, per Nav Map §3 row 04).

## Layout Description
Top-to-bottom, left-to-right:

1. **Top bar (sticky, 56px + safe-area top).** Background `neutral-50` (light) / `neutral-900` (dark), gains `shadow-sm` on scroll. Contents left-to-right:
   - **Back chevron** (`ChevronLeft`, 24px, `neutral-700`) — 44×44 hit area.
   - **Account selector chip** `.acct-chip` (design system §13.6): a pill, `radius-full`, bg `neutral-100`, `space-2`×`space-3`, containing a **type-colored dot** (8px, `courant`=`primary-600`, `épargne`=`success-500`, `espèces`=`warning-500`, `autre`=`neutral-500`) + the account name (`body-sm`, `neutral-700`) + `ChevronDown` (16px, `neutral-400`). When scope = all accounts the label reads "Tous les comptes" and the dot becomes a small 4-dot cluster in the four type colors. Tap target ≥44px. Tapping opens the Account switcher sheet.
   - **Screen title** "Mouvements" (`h3`, `neutral-900`) — may be dropped on narrow widths where the chip occupies the bar; the chip + back chevron then imply the scope.
   - **Overflow "⋯"** (`MoreHorizontal`, 24px) — 44×44 hit area, opens a menu (Tout sélectionner, Effacer les filtres, Ordre de tri, Gérer les comptes → 13).
2. **Sticky filter/search zone** (immediately below top bar, sits above the list and sticks under the top bar on scroll). Three rows:
   - **Search bar:** full-width input, bg `neutral-100`, `radius-md`, `space-3`×`space-4`, 1px `neutral-200` border. Leading `Search` icon (20px, `neutral-400`). Placeholder "Rechercher un commerçant, une note…" (`body`, `neutral-400`). Clear "✕" button inside-right when text present. Focus → 2px `primary-500` border + `primary-50` halo.
   - **Kind filter chips** (segmented, `.seg`-style, horizontally scrollable, `space-2` gaps): **Tous** (default, selected) · **Dépense** · **Revenu** · **Virement**. Selected chip: bg `primary-50`, text `primary-700`, 1px `primary-200`. Default chip: bg `neutral-100`, text `neutral-700`. These are single-select (mutually exclusive); choosing "Dépense" hides income + transfers.
   - **Category / attribute filter chips row** (horizontally scrollable, hides scrollbar): one chip per **category** (icon + name, multi-select) + an "Montant ▾" chip (opens min/max sheet) + a "Période ▾" chip (opens date-range sheet). When the kind filter is **Revenu**, category chips are replaced by **income-type** chips (Salaire / Remboursement / Cadeau / Freelance / Vente / Autre); when the kind filter is **Virement**, category/type chips are hidden (transfers carry no category). When ≥1 filter active, a trailing "Réinitialiser" ghost-text button (`primary-600`, `body-sm`) appears with a count badge "·3".
3. **Running/filtered total strip** (sticky, directly under filter chips, above day headers; bg `white`/`neutral-800`, bottom border `neutral-200`/`neutral-700`). Left: `body-sm` `neutral-500` label "Total filtré · N transactions". Right: amount in `amount-md` (tabular figures), `neutral-900`. The **sign convention** of the total depends on the kind filter: "Tous" → net (income − expense, transfers excluded, shown with explicit `+`/`−` sign and color `success-600`/`danger-600`); "Dépense" → sum of outflows shown as `−`; "Revenu" → sum of inflows shown as `+` `success-600`; "Virement" → total moved (absolute, `neutral-900`) with a `caption` note "internes, hors totaux". A `caption` `neutral-500` line under the amount gives the count, and if a filter reduces the set, a `caption` `primary-600` hint "sur 214 au total" appears.
4. **List body** (scrollable, padded `space-4` left/right, gap `space-2` between rows). Grouped by day, **descending** (most recent day first). Each group:
   - **Sticky day header** (sticks under the running-total strip). bg `neutral-50`/`neutral-900`, `space-2` vertical padding, top border `neutral-200`/`neutral-700`. Left: date label `body-sm` `neutral-700` — "Aujourd'hui", "Hier", or "lun. 23 juin". Right: that day's subtotal in `amount-md` tabular, `neutral-900` (net, with explicit sign; transfers excluded).
   - **Movement rows** (one per movement that day). Each row is a card: bg `white`/`neutral-800`, `radius-lg`, `shadow-sm`, `space-3` vertical / `space-4` horizontal padding. Layout left-to-right:
     - **Category/icon tile** (left): 40×40px, `radius-full`. For expenses/income, bg = the category/income-type color at ~15% opacity, icon 20px in the full color (e.g. `ShoppingCart` indigo). For **transfers**, the tile shows a `ArrowLeftRight` icon on a `primary-50` bg in `primary-600`. Tap target padded to 44×44.
     - **Direction badge** `.dir` (design system §13.2, never color alone — always icon + label): a small `radius-sm` pill, `caption`, inset top-right of the title line or beside the amount. **`out`** = `danger` (`ArrowDownRight` icon + "−"); **`in`** = `success` (`ArrowUpRight` icon + "+"); **`trf`** = `primary` (`ArrowLeftRight` icon + "⇄"). Color tokens: `out`=`danger-600`/`danger-50` bg, `in`=`success-600`/`success-50` bg, `trf`=`primary-600`/`primary-50` bg.
     - **Title + meta column** (middle, flex-1): line 1 merchant/note (`body`, `neutral-900`, single line, ellipsis on overflow). For transfers the title reads "Virement → {destination account name}" or "Virement ← {source account name}". Line 2 `caption` `neutral-500`: time (e.g. "18:42") · category or income-type name.
     - **Account tag** (middle, inline at end of line 2 or as a tiny `radius-full` chip): the account name with its type-colored dot, e.g. "· Compte courant". When scope = "Tous les comptes" both legs of a transfer show; when scoped to one account, only that account's leg shows and the counter-leg account is named in the tag. This tag is the explicit account attribution required for a multi-account list.
     - **Amount** (right): `amount-md` tabular, right-aligned. **Outflows** `neutral-900` with leading "−" (e.g. "−28,90 €"). **Inflows** `success-600` with leading "+" (e.g. "+1 850,00 €"). **Transfers** `neutral-700`, no sign (internal move), shown as the leg amount on this account (e.g. "200,00 €"). If a row is `pending` sync, a tiny `caption` `warning-600` "·sync" appears under the amount.
     - **Selection check** (only in multi-select mode): leading 24px checkbox circle replaces the icon tile; checked = `primary-600` fill + white `Check`.
5. **Swipe-revealed actions** (per row): swipe-left reveals a right-anchored action stack — **Supprimer** (bg `danger-600`, white `Trash2`, label `caption`) and **Modifier** (bg `primary-600`, white `Pencil`). A trailing "⋯" affordance per row opens the same actions in a bottom-sheet menu for accessibility (see Interactions). **Transfer rows reveal a special delete** that affects both legs (see Notes).
6. **Multi-select action bar** (appears only when ≥1 row selected; replaces the running-total strip, slides up). Left: "N sélectionnés" (`body-sm` `neutral-700`) + a "Tout sélectionner" ghost link. Right: icon buttons — `Trash2` (danger), `Pencil` (edit, single only), `Copy` (duplicate), `X` (exit multi-select). All 44×44.
7. **Empty / no-results / loading states** occupy the list body area (see States).

## Components & Elements
| Element | Type | Details |
|---|---|---|
| Top bar | Sticky bar | 56px + top safe-area; `neutral-50`/`neutral-900`; `shadow-sm` on scroll. Back chevron, account chip, title, overflow ⋯. |
| Back chevron | Icon button | `ChevronLeft` 24px, 44×44 hit area, `aria-label="Retour"`. |
| Account selector chip `.acct-chip` | Pill button | `radius-full`, `neutral-100`, type-colored dot + name + `ChevronDown`, 44px tall, `aria-label="Filtrer par compte, {name}"`. Opens switcher sheet. |
| Title | Text | "Mouvements", `h3` (`neutral-900`). |
| Overflow menu | Icon button + menu | `MoreHorizontal` 24px, 44×44, `aria-label="Plus d'actions"`. Items: Tout sélectionner, Effacer les filtres, Ordre de tri, Gérer les comptes. |
| Search input | Text field | `neutral-100` fill, `radius-md`, leading `Search`, trailing clear ✕. `aria-label="Rechercher un mouvement"`. Debounced 200ms. |
| Kind filter chips (`.seg`) | Segmented chips | Tous · Dépense · Revenu · Virement. Single-select. `radius-full`, `body-sm`. |
| Category/income-type chips | Chips (scrollable) | Expenses: category chips (multi-select). Income: income-type chips. Transfers: hidden. |
| Montant chip | Filter chip | Opens min/max sheet. `aria-label="Filtrer par montant"`. |
| Période chip | Filter chip | Opens date-range sheet. `aria-label="Filtrer par période"`. |
| "Réinitialiser" button | Ghost text button | `primary-600`, `body-sm`. Visible only when filters active. |
| Running total strip | Sticky panel | `neutral-50`/`neutral-900`; label + `amount-md` tabular total (sign/color per kind) + `caption` count. |
| Day header | Sticky section header | `neutral-50`/`neutral-900`; date label + day net subtotal (`amount-md` tabular, explicit sign). |
| Movement row | Card (list row) | `white`/`neutral-800`, `radius-lg`, `shadow-sm`, swipeable, long-pressable. |
| Category/icon tile | Avatar | 40×40 `radius-full`, tinted bg, 20px Lucide icon (`ArrowLeftRight` for transfers). |
| Direction badge `.dir` | Pill | `radius-sm`, `caption`, icon + label. `out`=danger, `in`=success, `trf`=primary. Icon + label always (never color alone). |
| Account tag | Inline chip | `radius-full`, `caption`, type-colored dot + account name. Required attribution on every row when scope = all. |
| Row amount | Text | `amount-md`, tabular, right-aligned. `−` outflows `neutral-900`, `+` inflows `success-600`, transfers `neutral-700` sign-less. |
| Swipe actions | Action stack | Supprimer (`danger-600`), Modifier (`primary-600`). Each 80px wide, full row height (≥64px). |
| Row ⋯ menu (a11y alt) | Icon button + bottom sheet | `MoreHorizontal`, 44×44, `aria-label="Actions pour {title}"`. Opens sheet: Modifier / Dupliquer / Supprimer. |
| Multi-select bar | Sticky action bar | Replaces total strip when selecting. Count + Tout sélectionner + action icons. |
| Account switcher sheet | Bottom sheet | `radius-lg`, `shadow-lg`, drag handle, "Tous les comptes" + account list (balance + type dot) + "Gérer" link → Accounts (13). |
| Pull-to-refresh | Gesture | Spinner (`neutral-400`) + "Synchronisation…" `caption`; success → `success-600` toast "À jour". |
| Empty-state illustration | Graphic + text | `SearchX` or `ArrowLeftRight` Lucide icon 48px `neutral-300`; `body` `neutral-500` message; ghost CTA. |

## Data Fields
| Field | Type | Example Value | Validation |
|---|---|---|---|
| `movement.id` | uuid | `"f3c1…"` | non-null |
| `movement.kind` | enum | `expense` | one of `expense`, `income`, `transfer` |
| `movement.amount` | number (2 decimals) | `28.90` | > 0; rendered tabular in € |
| `movement.direction` | derived enum | `out` | `in`/`out`/`trf` — derived from kind + account side (§13.2) |
| `movement.accountId` | uuid | `acc-courant` | FK → Account; the account this row is attributed to |
| `movement.counterAccountId` | uuid \| null | `acc-epargne` | set for transfers (the other leg's account); null otherwise |
| `movement.transferGroupId` | uuid \| null | `trf-91a…` | groups the two legs of one transfer (both share it); null otherwise |
| `movement.merchant` | string | `"Carrefour"` | 1–80 chars; falls back to note |
| `movement.note` | string \| null | `"Courses semaine"` | ≤140 chars; title if no merchant |
| `movement.categoryId` | uuid \| null | `cat-courses` | FK → Category (expenses); null for income (uses incomeType) and transfers |
| `movement.incomeType` | enum \| null | `Salaire` | Salaire/Remboursement/Cadeau/Freelance/Vente/Autre (income only); null otherwise |
| `movement.timestamp` | ISO datetime | `2026-06-24T18:42:00` | ≤ now |
| `movement.pendingSync` | boolean | `true` | from sync queue |
| (derived) `dayKey` | date | `2026-06-24` | grouping key |
| (filter) `account` | `all` \| uuid | `all` | scope; default `all` or the Dashboard's active scope |
| (filter) `kind` | enum | `all` | `all`/`expense`/`income`/`transfer` |
| (filter) `q` | string | `"carrefour"` | matched vs merchant + note (case-insensitive) |
| (filter) `cat[]` | uuid[] | `[cat-courses]` | OR within; only applied to expenses |
| (filter) `incomeType[]` | enum[] | `[Salaire]` | OR within; only applied to income |
| (filter) `min`, `max` | number \| null | `5`, `50` | inclusive on amount |
| (filter) `from`, `to` | date \| null | `2026-06-01`, `2026-06-30` | inclusive on `timestamp` date |

## States
- **Empty state (no movements at all, fresh user):** centered block, top ~40% of screen. `ArrowLeftRight` icon 48px `neutral-300`. `body` `neutral-600` "Aucun mouvement pour l'instant". `body-sm` `neutral-500` "Touchez + pour enregistrer votre première opération." Ghost Secondary button "Ajouter une dépense" (`primary-50`/`primary-700`) → Quick-action sheet. Filter chips and total strip are hidden; only search (disabled) shows.
- **Empty state for a single empty account:** "Aucun mouvement sur « {account} »." Ghost "Changer de compte" → switcher sheet.
- **Loading state (initial query / sync):** list body shows 6 shimmer placeholder rows (bg `neutral-100` blocks pulsing opacity 0.4↔0.7, reduced-motion: static `neutral-100`). Day headers and total strip show `caption` `neutral-400` "—" for totals until loaded.
- **Error state (local DB read failure — rare, offline-first):** centered `body` `danger-600` "Impossible de charger les mouvements." `body-sm` `neutral-500` "Vos données restent enregistrées localement." Danger ghost button "Réessayer".
- **No-results state (filters/search return nothing):** `SearchX` icon 48px `neutral-300`. `body` `neutral-600` "Aucun mouvement correspondant". `body-sm` `neutral-500` summary "Aucun résultat pour « carrefour » dans Courses, mai–juin." Ghost "Effacer les filtres" button (`primary-600`).
- **Populated state:** default — grouped list with sticky headers, running total reflects the active kind/account/filter, day net subtotals per group. Pull-to-refresh available.
- **Multi-select state:** long-press a row → row highlights (`primary-50` tint), checkbox appears on all rows, multi-select bar slides in. Tapping rows toggles selection. Exiting (✕) restores normal mode.
- **Transfer-leg coalescing:** when scope = "Tous les comptes", a transfer may be shown as **one combined row** (icon `ArrowLeftRight`, title "{from} → {to}", amount sign-less, both account tags) or as two rows — **see 🔴 open question 3**.

## Interactions & Micro-animations
- **Account chip tap** → opens Account switcher sheet (translateY 16px + fade, 200ms standard ease). Selecting an account updates the chip dot/name and re-filters the list in place (no navigation); the running total and day subtotals recompute.
- **Kind chip tap** → single-select toggle with `scale(.96)` pop 120ms; category vs income-type vs (hidden) chips swap; list re-filters with a cross-fade (FLIP animates removed/added rows).
- **Swipe-left on a row** (Nav Map §5):
  - Dragging left translates the row content; the action stack is revealed underneath, right-anchored.
  - Action widths: Supprimer 80px, Modifier 80px (full reveal = 160px). Each action is full row height (min 64px) → comfortably ≥44px.
  - **Snap thresholds:** drag past 40px → snaps to reveal Supprimer only (80px). Drag past 160px → snaps to full reveal (Supprimer+Modifier). Release below 40px → snaps back closed (standard ease 200ms).
  - **Commit-on-drag (fast delete):** if the user drags the row fully (≥160px) and releases, Supprimer commits immediately with haptic (medium). Otherwise tapping a revealed action commits that action.
  - Tapping elsewhere or scrolling snaps all open rows closed.
  - **Accessibility alternative:** each row has a trailing "⋯" affordance that opens a **bottom sheet** with Modifier / Dupliquer / Supprimer — identical outcomes, no swipe required.
- **Long-press row** → haptic (light) + enters multi-select, row checked, multi-select bar slides up (16px translateY + fade, 200ms standard ease).
- **Tap row** (not in multi-select) → push to the matching edit screen: Edit Expense (12) for expenses, Add/Edit Income (14) for income, Transfer (16) for transfers. Emphasized page transition 280ms.
- **Tap category/income-type chip** → toggles selection with a `scale(.96)` pop 120ms; list re-filters (FLIP).
- **Pull-to-refresh:** drag past 64px shows spinner; release → sync. On success, a bottom toast (`success-600`, `shadow-toast`) "À jour" auto-dismisses 4s.
- **Delete confirm:**
  - **Expense / income (single or multi):** centered modal (`radius-xl`, `shadow-lg`) "Supprimer N opération(s) ?" with Danger "Supprimer" and Ghost "Annuler". Deletes animate row height→0 + opacity (FLIP).
  - **Transfer:** a **different confirm modal** — "Supprimer ce virement ?" with body `body-sm` `neutral-600` "Un virement est composé de deux écritures (débit sur « {from} », crédit sur « {to} »). Les deux seront supprimées." Danger "Supprimer le virement" / Ghost "Annuler". Deleting removes **both legs** (matched by `transferGroupId`). If only one leg is in view (scoped to one account), the modal still explains the counter-leg will be removed.
  - **Confirmed recurring occurrence:** deleting a row that was generated by confirming a recurring occurrence is **not** done from here — it is handled in the Recurring screen (15), which manages the expected→confirmed lifecycle. From this list, attempting to delete such a row shows an informational sheet "Cette opération vient d'un récurrent. Gérez-la depuis l'écran Récurrents." with a "Ouvrir Récurrents" link (see 🔴 open question 4).
- **Amount changes / running total:** on filter change, the total updates with a 300ms count-up unless `prefers-reduced-motion` (then instant).
- **Edge-swipe right** → back to origin (Nav Map §5).
- All `scale` pops and FLIP/count-up are disabled under `prefers-reduced-motion`; only ≤150ms opacity fades remain.

## Accessibility Notes
- Back chevron: `aria-label="Retour au tableau de bord"`. Account chip: `aria-label="Filtrer par compte, actuellement {name}"`. Overflow ⋯: `aria-label="Plus d'actions"`. Search: `aria-label="Rechercher un mouvement"`. Row ⋯: `aria-label="Actions pour {title}"`.
- Every interactive element ≥44×44px (chips, icon tiles padded, action buttons full-height, account chip 44px tall).
- Swipe is **not** the only path: the row ⋯ sheet provides Modifier/Dupliquer/Supprimer to keyboard and screen-reader users. Long-press multi-select is also reachable via the overflow menu's "Tout sélectionner" entry.
- Focus order (tab): back chevron → account chip → overflow ⋯ → search input → kind chips → category/type chips → Montant → Période → Réinitialiser → running total (if focusable) → first row → row ⋯ → next row … Day headers are `role="separator"` with the date as accessible name.
- Screen reader: row announced as "{direction label, e.g. dépense sortante}, {merchant or note}, {category or income type}, {time}, {amount} euros, compte {account name}". Direction is **spoken** (the `.dir` badge carries a text label, not just color). Pending rows append "en synchronisation". Multi-select announces "{N} sélectionnés".
- The kind filter is exposed as `role="radiogroup"` `aria-label="Type d'opération"`, chips as `role="radio"` `aria-checked`; category multi-select chips use `aria-pressed`.
- Sticky bars do not trap focus; modals/sheets (account switcher, delete confirm, row ⋯ sheet) trap focus and restore on close.
- `prefers-reduced-motion`: disable count-up, FLIP, scale pops, swipe snap animations (snap is instant); keep opacity fades ≤150ms.
- Color is never the sole signal: direction badges use icon + label + color; selected chips use bg + border + icon check; pending rows use a text label.

## Notes / Open Questions
- 🔴 **1. FAB / quick-action presence on this pushed screen.** Nav Map §2 says the FAB is "always present on the 4 tab roots" and hidden while a modal/sheet is open — but this is a pushed screen with no bottom nav. Should a standalone FAB (→ Quick-action sheet) float here for quick add, or is "tap a row / back then FAB" sufficient? Recommendation: show a single FAB (bottom-right, `shadow-fab`) since there's no bottom nav to host it, but confirm it doesn't conflict with the multi-select bar placement.
- 🔴 **2. Transfer row display when scope = all accounts.** Should a transfer be one combined row (cleaner, but the amount has no sign and the direction badge is `trf`) or two rows (one per leg, each with its own `out`/`in` badge and account tag)? Two rows is more consistent with the per-day subtotal math and with single-account scoping; one row is less cluttered. Recommendation: **two rows** (each leg) for consistency and correct per-account attribution; the `transferGroupId` lets a future "collapse transfers" toggle coalesce them.
- 🔴 **3. Recurring-sourced rows — delete vs. redirect.** A movement created by confirming a recurring occurrence should not be casually deleted from the movements list, because it would desync the recurring lifecycle. Current spec redirects to the Recurring screen (15). Confirm this is the desired UX, or allow a "soft delete here that also un-confirms the occurrence" shortcut.
- 🔴 **4. Search scope.** Search covers merchant + note only. Should it also match category/income-type name and amount (e.g. typing "28,90")? Affects the debounce/index strategy.
- 🔴 **5. Bulk edit semantics.** Multi-select → Modifier is only meaningful for single selection; for multi it should be hidden or repurposed to "Recatégoriser". Confirm desired bulk operations (re-categorize, bulk-delete, bulk-export?).
- 🔴 **6. Transfers in totals.** Transfers are excluded from income/expense totals (§13.2). When kind = "Virement" the strip shows an absolute total with a note "internes, hors totaux". Confirm this reads clearly, or hide the total strip entirely for the Virement kind.
- 🔴 **7. Route name.** The route stays `/expenses` for deep-link parity, but the screen is now "Mouvements". Confirm whether to alias/migrate to `/movements` (would break existing bookmarks/exports referencing the old route).
