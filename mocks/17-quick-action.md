# Quick-Action Sheet

## Purpose

The single entry chooser that the `+` FAB opens on every screen that shows the FAB. Presents three large tiles — **Dépense** (danger) / **Revenu** (success) / **Virement** (primary) — plus a secondary "Gérer les récurrents" ghost button. Selecting a tile opens the corresponding modal/sheet. It replaces the old "FAB → Add Expense directly" behavior, while preserving the `/add` deep link that still opens Add Expense (03) directly for parity. Bottom sheet (`.qas`-style per §13.6).

## Navigation

- **Entry point:** the center `+` FAB on any of the 4 tab roots (Accueil / Stats / Calendrier / Réglages) — i.e. anywhere the FAB is present. FAB is hidden while any modal/sheet (including this one) is open (§2 of nav map).
- **Chrome:** sheet with drag handle, `h2` "Ajouter", no top bar of its own (sits above the dimmed origin screen). Scrim behind. No bottom nav visible (covered by scrim).
- **Destinations:**
  - **Dépense** → Add Expense (03), fullscreen modal, slide-up + fade, emphasized ease 280ms. (Deep link `/add`.)
  - **Revenu** → Add Income (14), fullscreen modal. (Deep link `/income`.)
  - **Virement** → Transfer (16), bottom sheet (replaces this sheet). (Deep link `/transfer`.)
  - **Gérer les récurrents** → Recurring (15), pushed screen. (Deep link `/recurring`.)
- **Exit:** selecting a tile dismisses this sheet and opens the target. Scrim tap / swipe-down / Esc → close (no dirty guard; nothing to discard).

## Layout Description

1. **Dimmed origin** behind: the screen the user was on (Dashboard in the mock), blurred 2px and at 45% opacity, with its top-bar `.acct-chip` still faintly visible — gives context that you're adding to "Tous les comptes" / the scoped account.
2. **Scrim** (`rgba(15,23,42,.45)`).
3. **Sheet** (`radius-lg` top, `shadow-lg`, `space-5`/`space-8` padding, safe-area bottom):
   - Drag handle (40×4px `neutral-300`).
   - `h2` "Ajouter" (18px).
   - **3 large tiles** in a grid (`grid-template-columns: repeat(3,1fr)`, `space-2`/`10px` gap). Each `.qa` tile is a button:
     - `.qa-ic` circular/diamond icon container (e.g. 56px), bg = semantic color (`danger-600` / `success-600` / `primary-600`), white Lucide icon 24px (ArrowUpRight for Dépense? per mock: Dépense = rightward arrow `→`, Revenu = leftward arrow `←`, Virement = `ArrowLeftRight`).
     - `.qa-lbl` label below (`body-sm`/`button`, `neutral-700`): "Dépense" / "Revenu" / "Virement".
   - **Secondary ghost button** full-width, min 44px, `margin-top:14px`: Lucide `RefreshCw`/`Repeat` icon + "Gérer les récurrents".

## Components & Elements

| Element | Type | Details |
|---|---|---|
| FAB (trigger) | FAB | 56×56, `primary-600`, white `Plus`, `shadow-fab`. Toggles this sheet open/closed. Press `scale(.92)`. |
| Scrim | Overlay | `rgba(15,23,42,.45)`, z-index 30. Tap closes. |
| Sheet | Bottom sheet | `radius-lg` top, `shadow-lg`, drag handle, z-index 40. Swipe-down dismiss. |
| `.qa` tile | Button | Large, min 88×88, centered icon + label. `.qa-ic` colored circle, `.qa-lbl` text. `role="button"`, `aria-label` includes the action. |
| Dépense tile | `.qa` | `.qa-ic` `danger-600`, "Dépense". Opens Add Expense. |
| Revenu tile | `.qa` | `.qa-ic` `success-600`, "Revenu". Opens Add Income. |
| Virement tile | `.qa` | `.qa-ic` `primary-600`, "Virement". Opens Transfer. |
| "Gérer les récurrents" | Ghost button | Full-width, min 44px. Pushes Recurring (15). |
| Drag handle | Grip | Swipe-down to dismiss (release past 40% → close). |

## Data Fields

This screen has no persistent data fields; it is a pure launcher. Relevant params passed onward:

| Param | Carried to | Notes |
|---|---|---|
| `account` scope | Add Expense / Add Income / Transfer | The currently-scoped account (from the top-bar `.acct-chip`) is the default account in the opened modal/sheet. |
| `?account=<id>` | deep links | Explicit override. |

## States

- **Default (open) state:** Sheet slid up over a dimmed Dashboard; 3 tiles; ghost button. No input, no validation.
- **Opening animation:** sheet translateY 16px + opacity 0→1 (standard ease 200ms); scrim fades in; origin blurs.
- **Closing animation (tile selected):** sheet slides down + fades (200ms) **concurrently** with the target modal sliding up (emphasized 280ms) for a morph-like handoff (FAB→modal). For the pushed Recurring target, the sheet just dismisses and the push animates normally.
- **Closing animation (dismiss):** sheet slides down + fades; scrim fades out; origin un-blurs.
- **Offline state:** the FAB shows a pending-sync badge (§6 of nav map); the sheet still opens and all tiles remain enabled — adding works offline (queued).
- **No accounts state:** if the user has zero accounts, Dépense/Revenu/Virement tiles are disabled (`neutral-200`) with a caption "Créez d'abord un compte"; "Gérer les récurrents" stays enabled (harmless). A toast on tap would be redundant (tiles disabled).
- **Single account state:** Virement tile is disabled with caption "Ajoutez un second compte pour virement" (need ≥2 accounts to transfer).

## Interactions & Micro-animations

- **Tap FAB** → sheet opens (see opening animation); FAB icon optionally morphs `Plus` → `X` and rotates 45° while open (tapping again closes).
- **Tap a tile** → sheet dismisses + target opens (see closing animation). Haptic light on tile tap.
- **Tap "Gérer les récurrents"** → sheet dismisses; Recurring (15) pushed.
- **Scrim tap / swipe-down / Esc** → dismiss (no guard).
- **Tile press** → `scale(.96)` 120ms; `.qa-ic` darkens one step.
- **Deep-link `/add`** → bypasses this sheet entirely and opens Add Expense (03) fullscreen modal directly (parity with legacy behavior; §8.3). Deep links `/income`, `/transfer` likewise open their targets directly.
- `prefers-reduced-motion`: no morph/blur; opacity-only fades ≤150ms; tiles do not scale.

## Accessibility Notes

- FAB: `aria-label="Ajouter"`, `aria-expanded` reflects sheet open state, `aria-haspopup="dialog"`.
- Sheet: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at "Ajouter".
- Tiles: `role="button"` (or `menuitem` in a `role="menu"` if preferred), each with a descriptive `aria-label` ("Ajouter une dépense", "Ajouter un revenu", "Faire un virement", "Gérer les récurrents"). Color is never the sole signal — each tile has a distinct icon + text label.
- Focus trap inside the sheet; first focus = first tile (Dépense). Esc / scrim closes.
- Origin screen behind is `aria-hidden="true"` while the sheet is open.
- All targets ≥44×44 (tiles far exceed).
- The disabled-state reason is exposed via `aria-describedby` caption.

## Notes / Open Questions

- 🔴 **FAB tap vs double-tap** (nav map §7.2). "Double-tap FAB = repeat last expense" is still flagged. With the quick-action chooser, single tap opens this sheet; if double-tap-repeat is desired, it must not collide. Recommendation: drop double-tap-repeat in V1 (the chooser is fast enough); confirm.
- 🔴 **FAB → sheet vs FAB → direct Add Expense.** This sheet is the new default; `/add` deep link preserves direct Add Expense for power users / external triggers. Confirm both paths coexist.
- 🔴 **Tile set frozen at 3?** Dépense / Revenu / Virement are the V1 set; "Récurrent" is demoted to a secondary ghost button (manage, not add). Confirm no "Nouveau récurrent" quick tile is wanted (it's reachable via Recurring (15) → "+ Nouveau").
- 🔴 **Morph animation cost** — the FAB→modal morph (emphasized 280ms) is nice-to-have; confirm it's worth the implementation vs a simple dismiss+open. Recommendation: simple dismiss+open in V1, morph as polish.
- 🔴 **FAB icon morph Plus→X** — confirm; some designs keep `Plus` always. Recommendation: morph for clarity that the sheet is open.
- The "Gérer les récurrents" ghost button is the only way to reach Recurring (15) from the FAB surface; Settings also links to it.
- Pending-sync badge on the FAB (offline) is defined globally (nav map §6) and is orthogonal to this sheet.
