# Gestion des catégories (05)

## Purpose
A pushed screen for creating, editing, reordering, and deleting the **expense categories** that classify expenses. It distinguishes system **DEFAULT** categories (locked, cannot be deleted) from **CUSTOM** categories and governs what happens to transactions when a category is removed.

**Multi-account clarification (light update):** expense categories are **GLOBAL across all accounts** — they are not per-account. A category created here applies to every account; an expense on "Compte courant" and one on "Espèces" draw from the **same** category list. (Balances are per-account; categories are shared taxonomy.) This is surfaced as a helper caption on the summary strip so the model is unambiguous.

Income is classified by a **separate managed list of income types** (Salaire / Remboursement / Cadeau / Freelance / Vente / Autre — Design System §13.3), **not** by these expense categories. **DECIDED (§13.3 / 09-settings #10): income types are managed in Settings (09)** → Organisation → "Types de revenus", as their own read-only list. They are **not** managed on this screen — this screen stays focused exclusively on expense categories.

## Navigation
- **Arrives from:** Settings (09) → "Catégories" row (Organisation group). Route: `/categories`.
- **Edge-swipe right** (Nav Map §5) = OS back; mirrored by the back chevron.
- **Goes to:**
  - Back chevron / edge-swipe → returns to Settings (09), scroll position restored.
  - "+ Nouvelle" (top bar right) → opens the **Add/Edit Category bottom sheet** (slides up, `radius-lg` top corners, drag handle, `shadow-lg`, scrim `rgba(15,23,42,.45)`).
  - Tap a row → opens the same sheet in **Edit mode**, pre-filled.
  - "Réorganiser" (top bar or overflow) → enters **Reorder mode** (drag handles appear; see Interactions).
- **No bottom nav** (pushed screen, per Nav Map §3 row 05).

## Layout Description
Top-to-bottom, left-to-right:

1. **Top bar (sticky, 56px + safe-area top).** bg `neutral-50`/`neutral-900`, `shadow-sm` on scroll. Left: back chevron (`ChevronLeft`, 24px, `neutral-700`, 44×44). Center/left: title "Catégories" (`h3`, `neutral-900`). Right:
   - Default mode: a "＋ Nouvelle" Primary-style text button (`primary-600`, `button`, 44px tall) OR a `Plus` icon button (44×44) on narrow widths.
   - Reorder mode: the right action becomes a Ghost "Terminé" button (`primary-600`) that exits Reorder mode.
2. **Summary strip** (non-sticky, directly under top bar, padded `space-4`). bg `white`/`neutral-800`, `radius-lg`, `shadow-sm`, `space-3` inner. Two columns + a helper line:
   - Left: `label` `neutral-500` "CATÉGORIES" + `h3` `neutral-900` count "8" with `caption` `neutral-500` "(6 par défaut · 2 personnalisées)".
   - Right: `label` "OPÉRATIONS" + `h3` `neutral-900` "147" with `caption` `neutral-500` "ce mois-ci".
   - **Helper line** (full-width, under the two columns): `caption` `neutral-500` with an `Info` icon (16px): "Communes à tous vos comptes — les catégories ne sont pas liées à un compte." This makes the global model explicit.
3. **Section: Catégories par défaut.** `label` `neutral-500` eyebrow "PAR DÉFAUT · 6" (padded `space-4` sides, `space-2` top). Followed by a stacked list of default-category rows (gap `space-2`, sides `space-4`):
   - Each row: card, bg `white`/`neutral-800`, `radius-lg`, `shadow-sm`, `space-3` vertical / `space-4` horizontal padding, min height 64px.
     - **Icon tile** (left): 40×40 `radius-full`, tinted bg (category color ~15%), 20px Lucide icon in category color.
     - **Middle column** (flex-1): line 1 name (`body`, `neutral-900`, e.g. "Courses"). Line 2 `caption` `neutral-500`: "{count} transactions · {total}" (e.g. "38 transactions · 412,10 €") — tabular amount. If an assigned budget exists, append " · budget 400 €".
     - **Right cluster:** a `Lock` icon (16px, `neutral-400`) indicating it cannot be deleted, then a `Pencil` edit icon button (20px, `neutral-500`, 44×44 hit area, `aria-label="Modifier {name}"`). No drag handle (default categories keep a fixed order).
4. **Section: Catégories personnalisées.** `label` "PERSONNALISÉES · 2" eyebrow. Same row structure, but the right cluster differs:
   - A **drag handle** (`GripVertical`, 20px, `neutral-400`, 44×44, `aria-label="Réorganiser {name}"`) on the far left of the row (only visible in Reorder mode, or always per 🔴 open question 2).
   - Right cluster: `Pencil` edit button + `Trash2` delete button (`danger-600`, 20px, 44×44, `aria-label="Supprimer {name}"`).
   - If a custom category has an assigned budget, a small `caption` `success-600`/`warning-600` pill may indicate budget status (optional; see 🔴 open question 4).
5. **Empty custom section** (user has added none): a dashed-border card (`neutral-200`, `radius-lg`, `space-6` padding) centered with `Plus` icon 24px `neutral-400`, `body` `neutral-600` "Aucune catégorie personnalisée", `body-sm` `neutral-500` "Créez-en une pour classer vos dépenses à votre façon.", Ghost Secondary button "Ajouter une catégorie".
6. **No "Types de revenus" section here (DECIDED — §13.3 / 09-settings #10).** Income types live in Settings, not on this screen, so this screen contains **no** income-type list. A single informational link may appear under the summary strip: `body-sm` `primary-600` "Types de revenus →" with a `caption` "Gérés dans les Réglages" — tapping it navigates to Settings (09) → Types de revenus. (The previously-specced inline TYPES DE REVENUS list is removed.)
7. **Add/Edit Category bottom sheet** (overlay, z-40, scrim z-30). Slides up, drag handle 40×4 `neutral-300` at top, `radius-lg` top corners, `shadow-lg`, max height ~85vh, scrollable. Contents (`space-4` padding, `space-4` gaps):
   - **Header row:** `h3` title "Nouvelle catégorie" / "Modifier la catégorie"; right-aligned Ghost "✕" close (44×44).
   - **Icon preview** (centered): 64×64 `radius-full` tile in the chosen color tint with the chosen icon at 32px — live-updates as the user picks.
   - **Name field:** `.label` "NOM"; text input (`neutral-100`, `radius-md`, `space-3`×`space-4`), placeholder "ex. Café". Helper `caption` `neutral-500` "Affiché sur chaque ligne d'opération". Error `caption` `danger-600` if duplicate/empty.
   - **Icon picker:** `.label` "ICÔNE"; a wrapping grid (6 cols) of Lucide subset icons (`ShoppingCart`, `Utensils`, `Car`, `Home`, `Film`, `Plane`, `HeartPulse`, `GraduationCap`, `Briefcase`, `Gift`, `Receipt`, `PiggyBank`, plus `Coffee`, `Dumbbell`, `Book`, `Smartphone`, `PawPrint`, `Baby`). Each cell 44×44, `radius-md`, selected = `primary-50` bg + 1px `primary-200` + icon `primary-600`; default = `neutral-100` bg + `neutral-500` icon.
   - **Color picker:** `.label` "COULEUR"; a wrapping row of the 10 preset swatches (indigo `#4F46E5`, sky `#0EA5E9`, emerald `#10B981`, amber `#F59E0B`, red `#EF4444`, pink `#EC4899`, violet `#8B5CF6`, teal `#14B8A6`, orange `#F97316`, slate `#64748B`). Each swatch 36×36 `radius-full`; selected = ring 2px `neutral-900` (light) / `white` (dark) offset 2px; default = no ring. Each has `aria-label="Couleur {name}"`.
   - **Budget field (optional):** `.label` "BUDGET MENSUEL (OPTIONNEL)"; a numeric input with leading "€" and tabular figures, placeholder "0,00". Helper `caption` "Laissez vide pour aucun budget".
   - **Scope note:** a `caption` `neutral-500` line with `Info` icon "S'applique à tous vos comptes." (reinforces the global model; no per-account toggle exists).
   - **Actions (sticky to sheet bottom):** full-width Primary "Enregistrer la catégorie" (`primary-600`, 48px tall). In Edit mode for a category with transactions, an additional Ghost Danger "Supprimer la catégorie" link appears above Save (opens the delete-confirm flow).
8. **Delete-confirm modal** (centered, `radius-xl`, `shadow-lg`, scrim): shown when deleting a custom category. See Interactions for the reassign-or-keep flow.

## Components & Elements
| Element | Type | Details |
|---|---|---|
| Top bar | Sticky bar | 56px + safe-area; back chevron, title "Catégories", right action (Nouvelle / Terminé). |
| Back chevron | Icon button | `ChevronLeft` 24px, 44×44, `aria-label="Retour aux réglages"`. |
| "+ Nouvelle" button | Text/icon button | `primary-600`, `button`, 44px tall, `aria-label="Nouvelle catégorie"`. |
| "Terminé" button | Ghost button | `primary-600`, exits Reorder mode. |
| Summary strip | Card | `radius-lg`, `shadow-sm`; counts of categories + transactions; global-scope helper line. |
| Global-scope helper | Text + icon | `caption` `neutral-500` + `Info` 16px: "Communes à tous vos comptes…". |
| Section eyebrow | Text | `.label` role, `neutral-500`, "PAR DÉFAUT" / "PERSONNALISÉES" / "TYPES DE REVENUS". |
| Category row | Card (list row) | `radius-lg`, `shadow-sm`, min 64px; icon tile + name/meta + actions. |
| Icon tile | Avatar | 40×40 `radius-full`, category-color tint bg, 20px Lucide icon. |
| `Lock` icon | Inline icon | 16px `neutral-400`, `aria-label="Catégorie par défaut, suppression impossible"`. |
| Edit button | Icon button | `Pencil` 20px, `neutral-500`, 44×44, opens sheet in Edit mode. |
| Delete button | Icon button | `Trash2` 20px, `danger-600`, 44×44 (custom only). |
| Drag handle | Icon button | `GripVertical` 20px, `neutral-400`, 44×44 (Reorder mode). |
| Add/Edit sheet | Bottom sheet | `radius-lg`, `shadow-lg`, drag handle, scrim, max 85vh. |
| Icon picker | Grid of icon buttons | 6-col, 44×44 cells, Lucide subset, selected ring/bg. |
| Color picker | Row of swatch buttons | 10 presets, 36×36 `radius-full`, selected ring. |
| Budget input | Numeric field | "€" prefix, tabular, optional. |
| Save button | Primary button | `primary-600`, 48px, full-width. |
| Move up/down buttons (a11y) | Icon buttons | `ChevronUp`/`ChevronDown`, 44×44, appear in Reorder mode as drag alternative. |
| Delete-confirm modal | Center modal | `radius-xl`, `shadow-lg`; reassign-or-keep flow. |
| Income-types link | Link row | `body-sm` `primary-600` "Types de revenus →" + `caption` "Gérés dans les Réglages"; navigates to Settings (09). (DECIDED — income types are not managed on this screen, §13.3.) |

## Data Fields
| Field | Type | Example Value | Validation |
|---|---|---|---|
| `category.id` | uuid | `cat-courses` | non-null |
| `category.name` | string | `"Courses"` | 1–32 chars; unique (case-insensitive); not empty |
| `category.icon` | string (Lucide name) | `"ShoppingCart"` | must be in the allowed subset |
| `category.color` | hex string | `"#10B981"` | must be one of the 10 preset swatches |
| `category.isDefault` | boolean | `true` | true for system categories; immutable |
| `category.sortOrder` | number | `3` | ordering within default/custom groups |
| `category.budgetMonthly` | number \| null | `400` | > 0, 2 decimals, or null |
| `category.scope` | constant | `"global"` | always `global` — categories are not per-account (no `accountId`) |
| (derived) `transactionCount` | number | `38` | count of expenses with this categoryId, **across all accounts** |
| (derived) `transactionTotal` | number | `412.10` | sum of those expenses across all accounts (tabular) |
| (delete flow) `reassignTargetId` | uuid \| null | `cat-autre` | where to move transactions, or null = keep/delete |
| (delete flow) `deleteTransactions` | boolean | `false` | if true & no reassign, transactions are deleted |
| (income types, separate) `incomeType.name` | enum | `Salaire` | Salaire/Remboursement/Cadeau/Freelance/Vente/Autre (§13.3); managed separately |

## States
- **Empty state (no custom categories, defaults present):** the PERSONNALISÉES section shows the dashed "Aucune catégorie personnalisée" card with "Ajouter une catégorie" CTA. The PAR DÉFAUT list is still populated. Summary strip reflects defaults only.
- **Loading state:** summary strip and rows show shimmer placeholders (opacity pulse; static under reduced-motion). Sheet does not open until data ready.
- **Error state (rare; local DB failure):** centered `body` `danger-600` "Impossible de charger les catégories." Danger ghost "Réessayer".
- **Populated state:** default — two sections (PAR DÉFAUT then PERSONNALISÉES), rows with counts/totals (aggregated across all accounts), edit/delete/handle affordances. The global-scope helper is always visible.
- **Reorder state:** drag handles (and move up/down buttons) visible on custom rows; rows subtly elevate (`shadow-md`) to signal grabbability; a `caption` `neutral-500` hint "Glissez pour réorganiser" appears under the top bar; Nouvelle button → Terminé. Reordering is live-persisted (or persisted on Terminé — see 🔴 open question 5).
- **Sheet open state:** scrim dims background; sheet slides up; background list is non-interactive but visible. The scope note "S'applique à tous vos comptes" is shown. Dirty-form guard (Nav Map §5) applies: closing with unsaved changes prompts "Abandonner les modifications ?".
- **Delete in progress:** the deleted row animates height→0 + opacity (FLIP); counts in summary strip count-down; toast confirms.

## Interactions & Micro-animations
- **Tap row (not on an action button)** → opens Add/Edit sheet in Edit mode (sheet translateY 16px + fade, 200ms standard ease).
- **"+ Nouvelle"** → opens sheet in Add mode (same transition).
- **Icon picker / color picker selection** → preview tile updates instantly; selected cell does a `scale(.96)` pop 120ms.
- **Save** → validates; on success, sheet slides down (dismiss), list updates with FLIP for new/edited row, a `success-600` toast "Catégorie enregistrée" auto-dismisses 4s. On validation error, the offending field gets 2px `danger-500` border + `caption` `danger-600` message; sheet stays. The new/edited category is immediately available on **every account's** Add Expense screen.
- **Drag to reorder (custom categories):**
  - Enter Reorder mode via the top-bar "Réorganiser" action (or overflow). Handles (`GripVertical`) appear on the left of each custom row.
  - Long-press a handle → row lifts (`shadow-md`, `scale(1.02)`), haptic (medium); drag to reorder within the PERSONNALISÉES section (default section is fixed). Other rows FLIP-animate out of the way (standard ease 200ms).
  - Release → row settles; `sortOrder` updates.
  - **Accessibility alternative:** each custom row in Reorder mode also shows `ChevronUp` / `ChevronDown` buttons (44×44, `aria-label="Monter {name}"` / `"Descendre {name}"`) that step the row one position. Keyboard focus + arrow keys also reorder when a handle is focused.
  - Exit Reorder mode via "Terminé" → handles hide, counts restore.
- **Delete a custom category** (per Nav Map §5 swipe/long-press rules, here via Trash2 button):
  - If the category has **0 transactions**: simple centered confirm modal "Supprimer « {name} » ?" with Danger "Supprimer" + Ghost "Annuler". On confirm → row animates out, toast "Catégorie supprimée".
  - If the category **has transactions** (on any account): centered confirm modal "Supprimer « {name} » ?" with body `body-sm` `neutral-600` "Cette catégorie est utilisée par {N} transactions ({total}), tous comptes confondus. Que faire de ces opérations ?" and **two radio choices**:
    1. "Les déplacer vers une autre catégorie" (selected by default) — reveals a category `<select>`/picker defaulting to a system "Autre" category; the chosen target must differ from the one being deleted.
    2. "Supprimer aussi les transactions" — destructive; selecting it enables the Danger button and shows a `danger-600` `caption` warning "Action irréversible."
    - A third implicit option "Keep transactions without a category" is **not offered** (transactions require a category — see 🔴 open question 1).
    - Buttons: Danger primary "Supprimer la catégorie" (label updates to "Supprimer la catégorie & N transactions" when option 2 is chosen), Ghost "Annuler".
- **Swipe-left on a row** (Nav Map §5): custom rows also support swipe-left to reveal Supprimer + Modifier (same pattern as Movements List 04: 80px each, 40px snap to Supprimer-only, 160px full). Default rows are **not** swipeable (locked). The Trash2/Edit buttons remain the primary, always-visible path.
- **Long-press a custom row** → opens the Add/Edit sheet in Edit mode (alternate to tap), with haptic.
- **Sheet dismiss:** swipe-down past 40% (drag handle follows finger), scrim tap, or ✕ — subject to dirty-form guard.
- All motion respects `prefers-reduced-motion`: disable FLIP, scale pops, drag-lift; reorder is instant; sheet uses ≤150ms fade.

## Accessibility Notes
- Back chevron `aria-label="Retour aux réglages"`. Nouvelle button `aria-label="Nouvelle catégorie"`. Edit `aria-label="Modifier {name}"`. Delete `aria-label="Supprimer {name}"`. Drag handle `aria-label="Réorganiser {name}"`. Move buttons `aria-label="Monter {name}"` / `"Descendre {name}"`. Lock icon `aria-label="Catégorie par défaut, suppression impossible"`. Swatches `aria-label="Couleur {name}"`. Icon cells `aria-label="Icône {name}"`. Global-scope helper: the `Info` icon is `aria-hidden`, the text is associated with the summary strip via `aria-describedby`.
- Every interactive element ≥44×44px (icon tiles, swatch buttons padded to target, picker cells 44×44).
- Drag-to-reorder is **never** the only mechanism: move up/down buttons and keyboard arrows are provided (WCAG 2.5.7 dragging-friendly alternative).
- Delete is **never** the only signal: default rows show a `Lock` icon + tooltip/label "Les catégories par défaut ne peuvent pas être supprimées"; the Trash2 button is absent on default rows.
- Focus order: back → Nouvelle/Réorganiser → summary (if focusable) → first row (handle → name → edit → delete) → next row. Section eyebrows are `role="separator"` with accessible names.
- The Add/Edit sheet traps focus while open and restores to the triggering button on close. The delete-confirm modal traps focus on the choices then the action buttons.
- Color is never the sole signal: selected swatch uses a ring + `aria-pressed`; selected icon cell uses bg + border + `aria-checked`.
- Screen reader: row announced "{name}, {count} transactions tous comptes confondus, {total} euros{, budget X}{, catégorie par défaut}". Reorder announces new position after a move.
- `prefers-reduced-motion`: disable FLIP, scale pops, drag-lift, count-up; keep ≤150ms fades.

## Notes / Open Questions
- 🔴 **1. "Keep transactions without a category" option.** The data model requires `categoryId` (FK must exist). Should we introduce a built-in "Autre" default category to always serve as a reassign target, and is "keep without category" ever valid? Recommendation: add a non-deletable "Autre" default category and always require a reassign target (no orphan transactions).
- 🔴 **2. Drag handle visibility.** Should `GripVertical` handles be always visible on custom rows (suggesting reorderability) or only in Reorder mode (cleaner default)? Always-visible handles improve discoverability but add clutter; recommendation = always visible on custom rows, since defaults lack them and that visually distinguishes the two groups.
- 🔴 **3. Editing default categories.** Defaults can't be deleted, but can their **name/icon/color** be edited? Current spec allows opening the sheet in Edit mode for defaults (the Delete affordance is hidden). Recommendation: allow editing icon/color but lock the name for defaults, to preserve meaning across the app. Confirm.
- 🔴 **4. Budget status pill on rows.** A `success-600`/`warning-600`/`danger-600` pill summarizing budget vs. spent on each category row could be useful but risks color-as-signal and clutter. Decision needed: show pill, show plain-text budget only (current spec), or hide budget entirely on this screen (budgets live in Budget Settings 07). Note: with global categories, a category's "spent" is the **sum across all accounts** — confirm that is the desired metric on this screen vs. an account-scoped view.
- 🔴 **5. Reorder persistence timing.** Should `sortOrder` persist on every drop (live) or only when the user taps "Terminé"? Live-persist is simpler but makes "cancel reorder" impossible; Terminé-persist needs a discard path. Recommendation: persist on drop (offline-first, no server round-trip), and drop the notion of cancel.
- 🔴 **6. Icon picker extensibility.** Only a Lucide subset is offered (~18 icons). Should users be able to pick from the full Lucide set (search-backed) or upload a custom icon? Current spec restricts to the subset for consistency; confirm the exact list with product.
- 🔴 **7. Color uniqueness.** Can two categories share a color, or should the picker disable already-used swatches? Allowing duplicates is simpler; disabling aids distinction. Recommendation: allow duplicates but warn via `caption` "Même couleur que « {other} »".
- ✅ **8. Where do INCOME TYPES live? — DECIDED (§13.3): option (b) Settings (09).** Income types are managed in **Settings → Organisation → "Types de revenus"** as their own read-only list (fixed V1 enum: Salaire / Remboursement / Cadeau / Freelance / Vente / Autre). This screen stays focused on expense categories and carries no income-type list (only an informational "Types de revenus →" link pointing to Settings). Custom income types (add/delete) are out of scope for V1.
- 🔴 **9. Per-account category visibility / hiding.** Since categories are global, a user cannot hide a category on a specific account. If per-account relevance matters (e.g. "Abonnement" only makes sense on Courant), consider an optional per-account "hidden categories" flag in a future iteration. Out of scope for V1.
